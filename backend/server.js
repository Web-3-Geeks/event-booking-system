
require("dotenv").config();

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET is not set in .env — refusing to start.");
  process.exit(1);
}

const app = require("./src/app");
const connectDB = require("./src/config/db");

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log(`Server running on ${PORT}`);
    });
  } catch (err) {
    console.log("Failed to start:", err.message);
    process.exit(1);
  }
}

start();
