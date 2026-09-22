
require("dotenv").config();

const express = require('express');
const cors = require("cors");
const connectDB = require("./src/config/db");
const healthRoutes = require("./src/routes/health.routes");
const authRoutes = require("./src/routes/auth.routes");
const eventRoutes = require("./src/routes/event.routes");
const notFound = require("./src/middleware/notFound");
const errorHandler = require("./src/middleware/errorHandler");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/events", eventRoutes);

app.use(notFound);
app.use(errorHandler);

async function start() {
    try {
        await connectDB();
        app.listen(PORT, () => {
            console.log(`Server running on ${PORT}`);
        });
    } catch(err) {
        console.log("Failed to start:", err.message);
        process.exit(1);
    }
}

start();