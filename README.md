# Borrowing Power Calculator

A JavaScript console application that estimates borrowing power from annual income, dependents, monthly living expenses, and credit card limits. It retrieves tax and Household Expenditure Measure (HEM) values from a local development API.

Built for the Ferocia Junior Engineering Code Exercise. The original brief is preserved in [EXERCISE.md](EXERCISE.md). The supplied API uses simplified tax and HEM calculations.

## Setup

Tested with Node.js 24.12.0 and npm. The application uses Node's built-in `fetch` and promise-based readline interface.

Install dependencies from the project directory:

```sh
npm install
```

## Run the calculator

Start the API in one terminal:

```sh
npm run api
```

The server listens on `http://localhost:3000`. Keep it running and start the calculator in a second terminal:

```sh
npm start
```

Enter plain numbers without currency symbols or thousands separators. Invalid entries display feedback and prompt again.

| Input | Accepted range (inclusive) | Units | Intergers Only Accepted
| --- | --- | --- | --- |
| Gross annual income | 0–99,999,999 | Dollars per year | No
| Dependents | 0–10 | People | Yes
| Declared living expenses | 0–100,000 | Dollars per month | No
| Total credit card limits | 0–2,000,000 | Dollars | No

The console prints the maximum loan amount and monthly repayment capacity. 

To stop the server, press `Ctrl+C` when finished.

## How the calculation works

The borrowing calculator uses the following default values: 30-year loan term, a 7% base interest rate, a 3 percentage point assessment buffer, and a monthly credit card liability of 3% of total limits. The default assessment rate is therefore 10% (7% + 3% = 10%).

1. Subtract annual tax from gross income and divide by 12.
2. Use the higher of declared monthly expenses and the API's monthly HEM baseline.
3. Subtract living expenses and credit card liability from net monthly income.
4. Return zero for both outputs if repayment capacity is zero or negative.
5. Convert positive repayment capacity into a loan principal using the assessment rate and loan term.

For a non-zero monthly rate:

```text
P = M × (1 − (1 + R)^(-N)) / R
```

`P` is maximum loan principal, `M` is monthly repayment capacity, `R` is the annual assessment percentage divided by 100 and then 12, and `N` is the number of months. At zero interest this calculation becomes `P = M × N`. 

Returned monetary amounts (Maximum Loan Amount Borrowable and Maximum Montly Repayment Amounts) are rounded to two decimal places.

For example, if the supplied API returns $24,000 annual tax and $3,100 monthly HEM for an income of $120,000 with two dependents. With $3,000 declared monthly expenses and $10,000 in credit limits, monthly repayment capacity is:

```text
M = ((120,000 − 24,000) / 12) − 3,100 − (10,000 × 0.03) = $4,600
```

The maximum loan amount borrowable would be:

```text
P = 4,600 × ((1 − (1 + 0.10 / 12)^(-360)) / (0.10 / 12))
  = $524,173.77
```

This assumes a 30-year loan term (360 monthly repayments) and a 10% annual assessment rate (7% base interest rate plus a 3 percentage point buffer), giving a monthly rate of approximately 0.00833333.

## Use from another JavaScript file

The module exports `BorrowingCalculator`, `CalculatorAPIHelper`, and `validateNumber`. Importing it does not start the console prompts.

```js
const { BorrowingCalculator } = require('./borrowingCalculator');

async function main() {
    const result = await BorrowingCalculator.calculateBorrowingPower(
        120000, // Gross annual income
        2,      // Dependents
        3000,   // Monthly living expenses
        10000,  // Total credit card limits
        10      // Annual assessment rate: 10%, including the buffer
    );

    console.log(result); // { maxLoanAmount, monthlyRepayment }
}

main().catch(console.error);
```
The method calculateBorrowingPower has two optional parameters. 
>The sixth argument, loan term in months (default `360`) and the seventh argument, credit liability fraction (default `0.03`).

Direct calls must provide a final assessment rate value and require the local API and authentication to pass.

## Tests

```sh
npm test
```

Tests use Mocha, Node's `assert`, and Sinon. API stub helper methods or `fetch` and simulated readline responses are used so test can be run in isolation without a running API server or valid development token.

The suite checks:

- Borrowing calculations for standard and high-income scenarios and zero and negative repayment capacity scenarios.
- API request URLs, query parameters, authentication headers, successful responses, HTTP errors, and network failures.
- Input validation for valid numbers, invalid text, empty input, limits, and whole-number requirements.

The suite does not currently test the full console interaction or API server.

## Project files

| File | Purpose |
| --- | --- |
| `borrowingCalculator.js` | API helpers, borrowing calculation, input validation, and console entry point |
| `test_calculator.js` | Unit tests and test doubles |
| `server.js` | Local HTTP API with simplified tax and HEM rules |
| `server.md` | API endpoints, authentication, and response formats |
| `EXERCISE.md` | Original exercise brief |

## Current limitations

- Input validation is applied by the console. Direct calls to `calculateBorrowingPower` do not validate all arguments.
- The API URL is fixed to `localhost:3000`.
- The API caps dependents at three for HEM calculations, even though the console accepts up to ten (matches the Bendigo Borrowing Calculator limits).
- API helpers check HTTP status and parse JSON but do not validate the returned field types.

## Troubleshooting

- **Could not reach API server:** Start `npm run api` and check that the server is listening on port 3000.
- **Tax or HEM request failed with 401:** Check `SERVER_AUTH_KEY` against the development token in [server.md](server.md), then restart the calculator.
- **Address already in use:** Another process is using port 3000. Check whether the development server is already running.
