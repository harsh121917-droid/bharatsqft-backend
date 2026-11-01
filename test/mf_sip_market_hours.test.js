const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const mongoose = require('mongoose');

describe('NSE Market Hours & FOT Handling for SIP Registration', () => {
  it('Calculates IST Market Hours correctly', () => {
    function isNseMarketHoursForDate(date) {
      const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
      const ist = new Date(utc + (3600000 * 5.5));
      const day = ist.getDay(); // 0 is Sunday, 6 is Saturday
      if (day === 0 || day === 6) return false;
      const minutes = ist.getHours() * 60 + ist.getMinutes();
      return minutes >= 9 * 60 && minutes < 15 * 60;
    }

    // Sunday evening 22:58 IST
    const sundayNight = new Date('2026-11-01T17:28:00.000Z');
    assert.strictEqual(isNseMarketHoursForDate(sundayNight), false, 'Sunday night must not be market hours');

    // Monday morning 11:30 AM IST (06:00 UTC)
    const mondayMarketTime = new Date('2026-11-02T06:00:00.000Z');
    assert.strictEqual(isNseMarketHoursForDate(mondayMarketTime), true, 'Monday 11:30 AM IST must be market hours');

    // Monday evening 18:00 IST (12:30 UTC)
    const mondayEvening = new Date('2026-11-02T12:30:00.000Z');
    assert.strictEqual(isNseMarketHoursForDate(mondayEvening), false, 'Monday 6:00 PM IST must not be market hours');

    // Saturday afternoon 12:00 IST (06:30 UTC)
    const saturdayNoon = new Date('2026-11-07T06:30:00.000Z');
    assert.strictEqual(isNseMarketHoursForDate(saturdayNoon), false, 'Saturday must not be market hours');
  });

  it('FOT error regex correctly matches NSE exchange error message', () => {
    const nseError = 'FOT Y IS NOT ALLOWED AFTER MARKET HOURS';
    const regexMatch = (/after market hours/i.test(nseError) || /fot.*market/i.test(nseError) || /fot y/i.test(nseError));
    assert.strictEqual(regexMatch, true, 'Regex must match NSE exchange FOT error message');
  });
});
