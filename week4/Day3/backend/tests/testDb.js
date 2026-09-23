const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongoServer;

async function connect() {
  mongoServer = await MongoMemoryServer.create({
    binary: { version: "7.0.14" },
  });

  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
}

async function clearDatabase() {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany();
  }
}

async function closeDatabase() {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongoServer.stop();
}

module.exports = { connect, clearDatabase, closeDatabase };
