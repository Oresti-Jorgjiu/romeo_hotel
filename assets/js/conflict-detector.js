/**
 * ConflictDetector – double-booking prevention via Firebase transactions.
 * Works in both admin and front-end contexts.
 */
class ConflictDetector {
  constructor(firebaseDb) {
    this._db = firebaseDb;
    this._lockTtlMs = 15 * 60 * 1000; // 15-minute lock TTL
  }

  /* ── date helpers ─────────────────────────────────── */

  _dateRange(checkIn, checkOut) {
    const dates = [];
    const cur = new Date(checkIn);
    const end = new Date(checkOut);
    while (cur < end) {
      dates.push(this._toYMD(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return dates;
  }

  _toYMD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /* ── check availability (atomic read) ────────────── */

  async checkAvailability(roomKey, checkIn, checkOut) {
    if (!this._db || !roomKey || !checkIn || !checkOut) {
      return { available: false, conflicts: [{ reason: 'Invalid parameters' }] };
    }

    const dates = this._dateRange(checkIn, checkOut);
    const conflicts = [];

    try {
      // Read blocked-dates for the room
      const blockedSnap = await this._db.ref(`blocked-dates/${roomKey}`).once('value');
      const blocked = blockedSnap.val() || {};

      // Read active locks (and filter out expired)
      const locksSnap = await this._db.ref(`locks/${roomKey}`).once('value');
      const locks = locksSnap.val() || {};
      const now = Date.now();

      for (const date of dates) {
        if (blocked[date]) {
          conflicts.push({ date, reason: 'blocked', source: blocked[date].source || 'unknown' });
        } else if (locks[date] && locks[date].expiresAt > now) {
          conflicts.push({ date, reason: 'locked', bookingId: locks[date].bookingId });
        }
      }
    } catch (err) {
      console.error('ConflictDetector.checkAvailability error:', err);
      return { available: false, conflicts: [{ reason: 'Database error', detail: err.message }] };
    }

    return { available: conflicts.length === 0, conflicts };
  }

  /* ── lock room (atomic write via transaction) ─────── */

  async lockRoom(roomKey, checkIn, checkOut, bookingId) {
    if (!this._db) throw new Error('Database not initialised');

    const dates = this._dateRange(checkIn, checkOut);
    const expiresAt = Date.now() + this._lockTtlMs;
    const lockData = { bookingId, expiresAt };

    // Use a multi-path update – each date is a separate node.
    // We use transactions per date to ensure atomicity.
    const acquired = [];

    try {
      for (const date of dates) {
        const ref = this._db.ref(`locks/${roomKey}/${date}`);
        const result = await ref.transaction((current) => {
          if (current !== null && current.expiresAt > Date.now()) {
            // Already locked by someone else
            return undefined; // abort
          }
          return lockData;
        });

        if (!result.committed) {
          // Roll back already-acquired locks
          await this._releaseDates(roomKey, acquired);
          throw new Error(`Could not lock date ${date} – another booking in progress`);
        }
        acquired.push(date);
      }
    } catch (err) {
      await this._releaseDates(roomKey, acquired);
      throw err;
    }

    return { bookingId, dates, expiresAt };
  }

  /* ── release lock ─────────────────────────────────── */

  async releaseLock(roomKey, bookingId, checkIn, checkOut) {
    if (!this._db) return;
    const dates = this._dateRange(checkIn, checkOut);
    await this._releaseDates(roomKey, dates, bookingId);
  }

  async _releaseDates(roomKey, dates, bookingId = null) {
    const updates = {};
    if (bookingId) {
      // Only release locks owned by this bookingId
      for (const date of dates) {
        const snap = await this._db.ref(`locks/${roomKey}/${date}`).once('value');
        const lock = snap.val();
        if (!lock || lock.bookingId === bookingId || lock.expiresAt < Date.now()) {
          updates[`locks/${roomKey}/${date}`] = null;
        }
      }
    } else {
      for (const date of dates) {
        updates[`locks/${roomKey}/${date}`] = null;
      }
    }
    try {
      if (Object.keys(updates).length) await this._db.ref().update(updates);
    } catch (e) {
      console.warn('ConflictDetector: failed to release locks', e);
    }
  }

  /* ── detect existing conflicts ────────────────────── */

  async detectConflicts() {
    if (!this._db) return [];
    const conflicts = [];

    try {
      const bookingsSnap = await this._db.ref('bookings').once('value');
      const bookings = bookingsSnap.val() || {};

      // Group bookings by room + dates to find overlaps
      const byRoom = {};
      Object.entries(bookings).forEach(([id, b]) => {
        if (b.status === 'cancelled') return;
        if (!byRoom[b.roomKey]) byRoom[b.roomKey] = [];
        byRoom[b.roomKey].push({ id, ...b });
      });

      Object.entries(byRoom).forEach(([roomKey, roomBookings]) => {
        for (let i = 0; i < roomBookings.length; i++) {
          for (let j = i + 1; j < roomBookings.length; j++) {
            const a = roomBookings[i], b = roomBookings[j];
            if (a.checkIn < b.checkOut && b.checkIn < a.checkOut) {
              conflicts.push({
                roomKey,
                bookingA: a.id, bookingB: b.id,
                checkInA: a.checkIn, checkOutA: a.checkOut,
                checkInB: b.checkIn, checkOutB: b.checkOut,
                sources: [a.source, b.source],
                detectedAt: Date.now()
              });
            }
          }
        }
      });

      // Log only NEW conflicts (deduplicate against existing records)
      const existingSnap = await this._db.ref('conflicts').once('value');
      const existing = existingSnap.val() || {};
      const existingPairs = new Set(
        Object.values(existing).map(e => `${e.bookingA}:${e.bookingB}`)
      );

      for (const c of conflicts) {
        const pairKey = `${c.bookingA}:${c.bookingB}`;
        if (!existingPairs.has(pairKey)) {
          const id = 'C' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
          await this._db.ref(`conflicts/${id}`).set({
            ...c,
            timestamp: Date.now(),
            resolved: false,
            resolution: ''
          });
          existingPairs.add(pairKey);
        }
      }
    } catch (err) {
      console.error('ConflictDetector.detectConflicts error:', err);
    }

    return conflicts;
  }

  /* ── get conflict log ─────────────────────────────── */

  async getConflicts() {
    if (!this._db) return [];
    try {
      const snap = await this._db.ref('conflicts').once('value');
      const data = snap.val() || {};
      return Object.entries(data).map(([id, v]) => ({ id, ...v }));
    } catch (e) {
      return [];
    }
  }

  /* ── clean up expired locks ───────────────────────── */

  async cleanExpiredLocks() {
    if (!this._db) return;
    try {
      const snap = await this._db.ref('locks').once('value');
      const allLocks = snap.val() || {};
      const now = Date.now();
      const removes = {};

      Object.entries(allLocks).forEach(([roomKey, dates]) => {
        Object.entries(dates || {}).forEach(([date, lock]) => {
          if (lock && lock.expiresAt < now) {
            removes[`locks/${roomKey}/${date}`] = null;
          }
        });
      });

      if (Object.keys(removes).length) {
        await this._db.ref().update(removes);
      }
    } catch (e) {
      console.warn('ConflictDetector: cleanExpiredLocks failed', e);
    }
  }
}

if (typeof window !== 'undefined') window.ConflictDetector = ConflictDetector;
if (typeof module !== 'undefined') module.exports = ConflictDetector;
