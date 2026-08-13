// Ported from apps-script-source-refactored/20_Bookings.js — pure time-slot
// math, shared by the Trainers and Bookings modules.
'use strict';
const config = require('../00_config');

function timeStrToMinutes_(str) {
  const parts = str.toString().trim().split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1] || 0, 10);
}

function minutesToTimeStr_(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return (h < 10 ? '0' + h : h) + ':' + (m < 10 ? '0' + m : m);
}

function generateTimeSlots_(startHour, endHour, slotMinutes) {
  const slots = [];
  const start = timeStrToMinutes_(startHour);
  const end = timeStrToMinutes_(endHour);
  for (let t = start; t + slotMinutes <= end; t += slotMinutes) {
    slots.push(minutesToTimeStr_(t) + '-' + minutesToTimeStr_(t + slotMinutes));
  }
  return slots;
}

// Firestore stores startHour/endHour as plain "HH:mm" strings (no Date
// object ambiguity like the original Sheet cells could have), so this is
// simpler than the original but preserves the same fallback behavior.
function normalizeTimeValue_(val) {
  return val ? val.toString() : '';
}

module.exports = { timeStrToMinutes_, minutesToTimeStr_, generateTimeSlots_, normalizeTimeValue_, TRAINER_DAY_MAP_: config.TRAINER_DAY_MAP_ };
