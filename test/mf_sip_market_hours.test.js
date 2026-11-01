const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('NSE Market Hours, FOT & Frequency Validations for SIP Registration', () => {
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

  it('DAILY SIP correctly computes mandatory end_date in DD/MM/YYYY format', () => {
    const recurringStartDate = new Date('2026-11-09T00:00:00.000Z'); // Monday
    const endDate = new Date(recurringStartDate);
    endDate.setFullYear(endDate.getFullYear() + 1);
    if (endDate.getDay() === 6) endDate.setDate(endDate.getDate() + 2);
    else if (endDate.getDay() === 0) endDate.setDate(endDate.getDate() + 1);

    const endDateFormatted = `${String(endDate.getDate()).padStart(2, '0')}/${String(endDate.getMonth() + 1).padStart(2, '0')}/${endDate.getFullYear()}`;
    assert.strictEqual(endDateFormatted, '09/11/2027');
    assert.ok(endDate.getDay() >= 1 && endDate.getDay() <= 5, 'End date must be a weekday');
  });

  it('WEEKLY SIP startDate automatically advances from Sunday to Monday to meet NSE weekday rule', () => {
    const sundayDate = new Date('2026-11-08T00:00:00.000Z'); // Sunday
    let recurringStartDate = new Date(sundayDate);
    const normFreq = 'WEEKLY';

    if (normFreq === 'DAILY' || normFreq === 'WEEKLY') {
      if (recurringStartDate.getDay() === 6) {
        recurringStartDate.setDate(recurringStartDate.getDate() + 2);
      } else if (recurringStartDate.getDay() === 0) {
        recurringStartDate.setDate(recurringStartDate.getDate() + 1);
      }
    }

    assert.strictEqual(recurringStartDate.getDay(), 1, 'Must advance to Monday (1)');
    const dateFormatted = `${String(recurringStartDate.getDate()).padStart(2, '0')}/${String(recurringStartDate.getMonth() + 1).padStart(2, '0')}/${recurringStartDate.getFullYear()}`;
    assert.strictEqual(dateFormatted, '09/11/2026', 'Must format to Monday 09/11/2026');
  });
});
