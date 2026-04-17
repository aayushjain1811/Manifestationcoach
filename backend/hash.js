const bcrypt = require("bcryptjs");

const password = "manifestation2026";

bcrypt.hash(password, 10).then(hash => {
  console.log("HASH:", hash);
});