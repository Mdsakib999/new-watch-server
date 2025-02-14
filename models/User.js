const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  uid: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  profilePicture: { type: String }, // Optional, to store the user's profile picture URL
  role: { type: String, default: "customer" }, // Default role is customer
});

const User = mongoose.model("User", userSchema);

module.exports = User;
