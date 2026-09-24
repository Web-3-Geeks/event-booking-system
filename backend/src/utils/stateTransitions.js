const BOOKING_TRANSITIONS = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CANCELLED"],
  CANCELLED: [],
};

const EVENT_TRANSITIONS = {
  UPCOMING: ["ONGOING", "CANCELLED"],
  ONGOING: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

function canTransition(transitions, from, to) {
  if (from === to) return false;
  return transitions[from]?.includes(to) ?? false;
}

function canTransitionBooking(from, to) {
  return canTransition(BOOKING_TRANSITIONS, from, to);
}

function canTransitionEvent(from, to) {
  return canTransition(EVENT_TRANSITIONS, from, to);
}

module.exports = { canTransitionBooking, canTransitionEvent };
