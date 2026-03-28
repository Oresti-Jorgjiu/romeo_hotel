
window.ROMEO_CONFIG = {
  hotelName: "Romeo Hotel",
  // ⚠️ PLACEHOLDER – replace with real hotel phone number before going live
  phoneDisplay: "+355 00 000 0000",
  email: "hello@romeohotel.al",
  address: "Bulevard Gjergj Kastrioti Qender Korce, Prane BKT, 7001 Korçë, Albania",
  mapEmbed: "https://www.google.com/maps?q=Bulevard%20Gjergj%20Kastrioti%20Qender%20Korce%20Prane%20BKT%207001%20Korce%20Albania&output=embed",
  // Firebase config - hotel manager fills these in the admin settings panel
  firebase: {
    apiKey: "",
    authDomain: "",
    databaseURL: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  },
  // PayPal config - hotel manager fills this in to receive direct payments
  paypalClientId: "test",
  roomPrices: {
    "deluxe-double":    { name: "Deluxe Double Room",    price: 65,  currency: "EUR", size: 15, maxGuests: 2 },
    "deluxe-twin":      { name: "Deluxe Twin Room",      price: 65,  currency: "EUR", size: 15, maxGuests: 2 },
    "deluxe-triple":    { name: "Deluxe Triple Room",    price: 80,  currency: "EUR", size: 17, maxGuests: 3 },
    "family-room":      { name: "Family Room",           price: 90,  currency: "EUR", size: 18, maxGuests: 4 },
    "deluxe-suite":     { name: "Deluxe Suite",          price: 120, currency: "EUR", size: 22, maxGuests: 2 },
    "deluxe-quadruple": { name: "Deluxe Quadruple Room", price: 100, currency: "EUR", size: 18, maxGuests: 4 }
  }
};
