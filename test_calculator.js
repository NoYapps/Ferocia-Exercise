/**
 * Borrowing Power Calculator Test Suite
 */



const assert = require('assert'); 
const sinon = require('sinon');
const {BorrowingCalculator, CalculatorAPIHelper, validateNumber} = require('./borrowingCalculator');

describe('Borrowing Power Calculator Tests', () => {
  let getTaxStub, getHEMStub;
 
  beforeEach(() => {
    /**
     * Creates objects that provide mock api call outputs
    */

    getTaxStub = sinon.stub(CalculatorAPIHelper, 'getTax');
    getHEMStub = sinon.stub(CalculatorAPIHelper, 'getHEM');
  });

  afterEach(() => {
    /**
     * Undoes stubs to be reset for next test case
    */
    sinon.restore();
  });


  // Test case for normal values
  it('should calculate borrowing power for standard values', async () => {

    getTaxStub.resolves(24000);
    getHEMStub.resolves(2000);

    const result = await BorrowingCalculator.calculateBorrowingPower(120000, 2, 3000, 10000, 7.5);

    // netMonthlyIncome = (120000 - 24000) / 12 = 8000
    // livingExpenses = max(3000, 2000) = 3000
    // creditCardLiability = 10000 * 0.03 = 300
    // maxMonthlyRepayment = 8000 - 3000 - 300 = 4700

    assert.ok(result.maxLoanAmount > 0, 'Should yield a positive borrowing power amount');
    assert.strictEqual(result.monthlyRepayment, 4700);
  });


  it('should return 0 when repayment capacity is exactly zero', async () => {
    getTaxStub.resolves(0);
    getHEMStub.resolves(2000);

    const result = await BorrowingCalculator.calculateBorrowingPower(24000, 0, 2000, 0, 7.5);

    // netMonthlyIncome = (24000 - 0) / 12 = 2000
    // livingExpenses = max(2000, 2000) = 2000
    // creditCardLiability = 0 * 0.03 = 0
    // maxMonthlyRepayment = 2000 - 2000 - 0 = 0
    assert.strictEqual(result.maxLoanAmount, 0);
    assert.strictEqual(result.monthlyRepayment, 0);
  });

  it('should return 0 when repayment capacity is negative', async () => {
    getTaxStub.resolves(5000);
    getHEMStub.resolves(4000);

    const result = await BorrowingCalculator.calculateBorrowingPower(30000, 3, 4000, 5000, 7.5);

    // netMonthlyIncome = (30000 - 5000) / 12 = 2083.33
    // livingExpenses = max(4000, 4000) = 4000
    // creditCardLiability = 5000 * 0.03 = 150
    // maxMonthlyRepayment = 2083.33 - 4000 - 150 = negative -> clamped to 0
    assert.strictEqual(result.maxLoanAmount, 0);
    assert.strictEqual(result.monthlyRepayment, 0);
  });


  //Test case for abnormal values
  it('should handle high income and low expenses', async () => {
    getTaxStub.resolves(150000);
    getHEMStub.resolves(800);

    const result = await BorrowingCalculator.calculateBorrowingPower(500000, 0, 1000, 20000, 7.5);

    const expectedRepayment = Number(((500000 - 150000) / 12 - 1000 - 600).toFixed(2));
    assert.strictEqual(result.monthlyRepayment, expectedRepayment);
    assert.ok(result.maxLoanAmount > 0);
  });

  it('should return 0 when repayment capacity is negative', async () => {
    getTaxStub.resolves(5000);
    getHEMStub.resolves(4000);

    const result = await BorrowingCalculator.calculateBorrowingPower(30000, 3, 4000, 5000, 7.5);

    assert.strictEqual(result.maxLoanAmount, 0);
    assert.strictEqual(result.monthlyRepayment, 0);
  });
});

describe('Calculator API Helper Tests', () => {
  let fetchStub;
  const originalKey = process.env.SERVER_AUTH_KEY;

  beforeEach(() => {
    /**
     * Creates fake key and fetch stub to simulate server for get requests
    */
    process.env.SERVER_AUTH_KEY = 'test-key';
    fetchStub = sinon.stub(global, 'fetch');
  });

  afterEach(() => {
    /**
     * Restores function stub for next test case 
     */ 
    sinon.restore();
    process.env.SERVER_AUTH_KEY = originalKey; //Restore original API key
  });

  //Successful API call checks 
  it('getTax should request the correct URL with income as a query param', async () => {
    fetchStub.resolves({ ok: true, json: async () => ({ tax: 1000 }) });

    await CalculatorAPIHelper.getTax(75000);

    const calledUrl = fetchStub.firstCall.args[0];
    assert.strictEqual(calledUrl.pathname, '/api/tax');
    assert.strictEqual(calledUrl.searchParams.get('income'), '75000');
  });

  it('getHem should request the correct URL with income and dependent as a query param', async () => {
    fetchStub.resolves({ ok: true, json: async () => ({ hem: 2700 }) });

    await CalculatorAPIHelper.getHEM(75000);

    const calledUrl = fetchStub.firstCall.args[0];
    assert.strictEqual(calledUrl.pathname, '/api/hem');
    assert.strictEqual(calledUrl.searchParams.get('income'), '75000');
  });

  it('getTax should send the auth token from the environment', async () => {
    fetchStub.resolves({ ok: true, json: async () => ({ tax: 1000 }) });

    await CalculatorAPIHelper.getTax(75000);

    const options = fetchStub.firstCall.args[1];
    assert.strictEqual(options.headers.Authorization, 'Bearer test-key');
  });

  it('getHem should send the auth token from the environment', async () => {
    fetchStub.resolves({ ok: true, json: async () => ({ hem: 2700 }) });

    await CalculatorAPIHelper.getHEM(75000, 1);

    const options = fetchStub.firstCall.args[1];
    assert.strictEqual(options.headers.Authorization, 'Bearer test-key');
  });

  //Test case for normal inputs
  it('getTax should return the tax value on a successful response', async () => {
    fetchStub.resolves({ ok: true, json: async () => ({ tax: 15000 }) });

    const tax = await CalculatorAPIHelper.getTax(90000);
    assert.strictEqual(tax, 15000);
  });

  it('getHEM should return the hem value and pass income & dependents', async () => {
    fetchStub.resolves({ ok: true, json: async () => ({ hem: 2200 }) });

    const hem = await CalculatorAPIHelper.getHEM(90000, 3);

    assert.strictEqual(hem, 2200);
    const calledUrl = fetchStub.firstCall.args[0];
    assert.strictEqual(calledUrl.searchParams.get('income'), '90000');
    assert.strictEqual(calledUrl.searchParams.get('dependents'), '3');
  });

  //Abnormal inputs
  it('getTax should throw a descriptive error on a non-ok response', async () => {
      
    fetchStub.resolves({ ok: false, status: 400 });

    await assert.rejects(() => CalculatorAPIHelper.getTax(9000), /Tax API request failed: 400/);

  });

  it('getHEM should throw a descriptive error on a non-ok response', async () => {
    fetchStub.resolves({ ok: false, status: 404 });

    await assert.rejects(() => CalculatorAPIHelper.getHEM(90000, 1), /HEM API request failed: 404/);

  });

  //fetch fail error validation
  it('should propagate a network-level failure error', async () => {
    fetchStub.rejects(new TypeError('Could not reach API server'));

    await assert.rejects(() => CalculatorAPIHelper.getTax(90000), /Error: Could not reach API server/);

  });

});

describe('Input Validator Tests', () => { 

  function makeFakeReadline(responses) {
    /**
     * Creates a fake readline interface that supplies predefined user responses
     * 
     * Each call to question() resolves to the next response in order, removing
     * it from an internal queue. Once exhausted, it resolves to undefined.
     * The original responses array is not modified.
     * 
     * @param {string[]} responses - Simulated user inputs in the order entered.
     * @returns {{ question: () => Promise<string | undefined> }}
     *  An object with an async question() method that supplies queued responses.
     */

    const queue = [...responses]; // copy responses iterable to queue

    return {
      question: async () => queue.shift() // removes and returns the first item each call
    };
  }

  //Test cases for normal inputs
  it('should accept a valid number on the first try', async () => {
    const rl = makeFakeReadline(['50000']);
    const value = await validateNumber('Income: $', rl, 0, 999999, false);
    assert.strictEqual(value, 50000);
  });

  it('should accept a valid float number on the first try', async () => {
    const rl = makeFakeReadline(['80700.78']);
    const value = await validateNumber('Income: $', rl, 0, 999999, false);
    assert.strictEqual(value, 80700.78);
  });

  it('should reject non-numeric and empty input, then retry', async () => {
    const rl = makeFakeReadline(['abc', '', '25000']);
    const value = await validateNumber('Income: $', rl, 0, 999999, false);
    assert.strictEqual(value, 25000);
  });

  //Test cases for out of limits inputs
  it('should reject values above the upper limit and retry', async () => {
    const rl = makeFakeReadline(['5000000', '100000']);
    const value = await validateNumber('Income: $', rl, 0, 999999, false);
    assert.strictEqual(value, 100000);
  });

  it('should reject values below the lower limit and retry', async () => {
    const rl = makeFakeReadline(['-10', '0']);
    const value = await validateNumber('Dependents: ', rl, 0, 10, true);
    assert.strictEqual(value, 0);
  });

  //Test cases for abnormal inputs 
  it('should reject non-integer input when integerOnly is true', async () => {
    const rl = makeFakeReadline(['2.5', '2']);
    const value = await validateNumber('Dependents: ', rl, 0, 10, true);
    assert.strictEqual(value, 2);
  });

  it('should reject non-bumerical input ', async () => {
    const rl = makeFakeReadline(['hsdfdf', '2']);
    const value = await validateNumber('Dependents: ', rl, 0, 10, true);
    assert.strictEqual(value, 2);
  });

  it('should reject a invalid formatted number on the first try', async () => {
    const rl = makeFakeReadline(['80700.00.909', '80700.78']);
    const value = await validateNumber('Income: $', rl, 0, 999999, false);
    assert.strictEqual(value, 80700.78);
  });

});


