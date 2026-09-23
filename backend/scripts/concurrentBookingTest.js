require("dotenv").config();
const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:5000/api";
const EVENT_ID = process.env.TEST_EVENT_ID;
const CONCURRENT_REQUESTS = parseInt(process.env.TEST_CONCURRENT || "20", 10);
const SEATS_PER_REQUEST = parseInt(process.env.TEST_SEATS || "1", 10);
const TOKEN = process.env.TEST_TOKEN;

if (!EVENT_ID || !TOKEN) {
  console.error(
    "Set TEST_EVENT_ID and TEST_TOKEN environment variables before running.",
  );
  process.exit(1);
}

async function bookOnce() {
  const start = Date.now();

  const response = await fetch(`${BASE_URL}/bookings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ eventId: EVENT_ID, quantity: SEATS_PER_REQUEST }),
  });

  const elapsed = Date.now() - start;

  return {
    success: response.ok,
    status: response.status,
    ms: elapsed,
  };
}

async function runTest() {
  console.log(`Firing ${CONCURRENT_REQUESTS} concurrent booking requests...`);

  const startedAt = Date.now();

  const promises = [];
  for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
    promises.push(bookOnce());
  }

  const results = await Promise.all(promises);

  const totalTime = Date.now() - startedAt;
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const avgMs = results.reduce((sum, r) => sum + r.ms, 0) / results.length;

  console.log("--- Results ---");
  console.log(`Total requests: ${results.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Average response time: ${avgMs.toFixed(1)}ms`);
  console.log(`Total wall time: ${totalTime}ms`);

  return { successful, failed };
}

async function main() {
  const beforeRes = await fetch(`${BASE_URL}/events/${EVENT_ID}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const before = (await beforeRes.json()).data.event;

  console.log(
    `Before: totalSeats=${before.totalSeats}, availableSeats=${before.availableSeats}`,
  );

  const { successful, failed } = await runTest();

  const afterRes = await fetch(`${BASE_URL}/events/${EVENT_ID}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const after = (await afterRes.json()).data.event;

  const expectedAvailable =
    before.availableSeats - successful.length * SEATS_PER_REQUEST;

  console.log("--- Consistency Check ---");
  console.log(`After: availableSeats=${after.availableSeats}`);
  console.log(`Expected availableSeats: ${expectedAvailable}`);
  console.log(`Seats never negative: ${after.availableSeats >= 0}`);
  console.log(
    `Seats never exceed total: ${after.availableSeats <= after.totalSeats}`,
  );
  console.log(
    `Consistency holds: ${after.availableSeats === expectedAvailable}`,
  );
}

main();

