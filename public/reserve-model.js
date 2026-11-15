export function futureDates(start, count = 7) {
  const base = new Date(`${start}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(base);
    date.setUTCDate(base.getUTCDate() + index);
    return { value: date.toISOString().slice(0, 10) };
  });
}

export function timeSlots(start = '12:00', end = '22:30', interval = 30) {
  const minutes = (value) => {
    const [hours, mins] = value.split(':').map(Number);
    return hours * 60 + mins;
  };
  const slots = [];
  for (let value = minutes(start); value <= minutes(end); value += interval) {
    slots.push(`${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`);
  }
  return slots;
}

export function withSeatingPreference(preference, notes = '') {
  const clean = notes.trim();
  if (!preference || ['Best available', 'Restaurant choice'].includes(preference)) return clean;
  return [`Seating preference: ${preference}`, clean].filter(Boolean).join('\n');
}
