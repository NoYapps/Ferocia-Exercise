/**
 * Estimates borrowing power using annual tax and monthly household expenditure
 * measure (HEM) values from the local API provided by server.js.
 * API requests use SERVER_AUTH_KEY from the environment, loaded via dotenv.
 * Running this file directly starts the interactive console calculator.
 */

require('dotenv').config()

// Global constant for mortgage simulation
const LOAN_TERM_MONTHS = 360; // 30 Years
const INTEREST_RATE = 7.0; // 7.0% baseline interest rate
const ASSESSMENT_RATE_BUFFER = 3.0; // 3.0% buffer added to interest rates
const CREDIT_LIABILITY = 0.03; // 3% of of total of credit

/**
 * Provides static methods for retrieving tax and HEM amounts from the local API.
 * No class instance is required.
 */
class CalculatorAPIHelper {
    /**
     * Retrieves annual tax for the supplied gross income.
     *
     * @param {number} income - Gross annual income in dollars.
     * @returns {Promise<number>} Annual tax in dollars from the API response.
     * @throws {Error} If the request fails, the HTTP status is unsuccessful,
     *   or the response cannot be parsed as JSON.
     */
    static async getTax(income) {
        const url = new URL("http://localhost:3000/api/tax");
        url.searchParams.set("income", income);

        const response = await this.#createRequest(url);

        if (!response.ok) {
            throw new Error(`Tax API request failed: ${response.status} - ${response.text}`);
        }

        const taxDetails = await response.json();
        return taxDetails.tax;
    }

    /**
     * Retrieves the household's monthly HEM living-expense baseline.
     *
     * @param {number} income - Gross annual income in dollars.
     * @param {number} dependents - Number of financial dependents.
     * @returns {Promise<number>} Monthly HEM amount in dollars from the API.
     * @throws {Error} If the request fails, the HTTP status is unsuccessful,
     *   or the response cannot be parsed as JSON.
     */
    static async getHEM(income, dependents) {
        const url = new URL("http://localhost:3000/api/hem");
        url.searchParams.set("income", income);
        url.searchParams.set("dependents", dependents);
        
        const response = await this.#createRequest(url);

        if (!response.ok) {
            throw new Error(`HEM API request failed: ${response.status}`);
        }

        const hemDetails = await response.json();
        return hemDetails.hem;
    }

    /**
     * Sends a GET request authenticated with SERVER_AUTH_KEY.
     * Callers check the HTTP status and parse the response body.
     *
     * @param {URL} url - API endpoint, including query parameters.
     * @returns {Promise<Response>} Fetch API response, including HTTP error responses.
     * @throws {Error} If fetch rejects, with the message "Could not reach API server".
     */
    static async #createRequest(url){
        try {
            const response = await fetch( 
                url,
                {
                    method: "GET",
                    headers:{
                        Authorization: `Bearer ${process.env.SERVER_AUTH_KEY}`
                    }
                }
            );

            return response
        }

        catch(error){
            throw new Error(`Could not reach API server`);
        }

    }
}

/**
 * Estimates loan principal from income, living expenses,
 * and credit card liabilities, using a fixed monthly repayment formula.
 */
class BorrowingCalculator {
    /**
     * Calculates borrowing power using the higher of declared expenses and HEM.
     * 
     * Returns zero for both outputs when repayment capacity is non-positive;
     * else, rounds monetary results to two decimal places.
     * 
     * Inputs are not validated here. 
     * 
     * A positive repayment capacity and a zero assessment rate currently produces 
     *  product of maxMonthlyRepayment and loan_term_months.
     *
     * @param {number} income - Gross annual income in dollars.
     * @param {number} dependents - Number of financial dependents.
     * @param {number} expenses - Declared monthly living expenses in dollars.
     * @param {number} creditLimits - Total credit card limits in dollars.
     * @param {number} annualAssessmentRate - Annual assesment rate as a fraction (interest + buffer rate).
     * @param {number} [loan_term_months=360] - Loan duration in months.
     * @param {number} [credit_liability=0.03] - Fraction of credit limits treated
     *   as a monthly liability
     * @returns {Promise<{maxLoanAmount: number, monthlyRepayment: number}>}
     *   Maximum loan principal and monthly repayment capacity in dollars.
     * @throws {Error} If retrieving or parsing tax or HEM data fails.
     */
    static async calculateBorrowingPower(income, dependents, expenses, creditLimits, annualAssessmentRate, loan_term_months = LOAN_TERM_MONTHS, credit_liability = CREDIT_LIABILITY) {
        // 1. Calculate Net Monthly Income after tax deductions
        const annualTax = await CalculatorAPIHelper.getTax(income);
        const netMonthlyIncome = (income - annualTax) / 12;

        // 2. Determine living expenses (User declared expenses vs HEM baseline, whichever is higher)
        const baselineHEM = await CalculatorAPIHelper.getHEM(income, dependents);
        const totalLivingExpenses = Math.max(expenses, baselineHEM);

        // 3. Calculate credit card liability (~3% of total limits)
        const creditCardLiability = creditLimits * credit_liability;

        // 4. Calculate monthly repayment capacity
        const maxMonthlyRepayment = netMonthlyIncome - totalLivingExpenses - creditCardLiability;

        // Return early if user cannot afford a loan at all
        if (maxMonthlyRepayment <= 0) {
            return { maxLoanAmount: 0, monthlyRepayment: 0 };
        }

        // 5. Calculate the monthly interest rate
        const monthlyRate = (annualAssessmentRate / 100) / 12;

        // 6. Calculate maximum borrowing power using the following formula:
        let maxLoanAmount = 0;
        if (monthlyRate != 0) {
            // P = M * (1 - (1 + R)^-N) / R
            maxLoanAmount = maxMonthlyRepayment * ((1 - Math.pow(1 + monthlyRate, - loan_term_months)) / monthlyRate);
        }
        else {
            //At zero interest: P = M * N
            maxLoanAmount = maxMonthlyRepayment * loan_term_months;
        }

        return {
            maxLoanAmount: Number(maxLoanAmount.toFixed(2)),
            monthlyRepayment: Number(maxMonthlyRepayment.toFixed(2))
        };
    }
}

/**
 * Prompts for household inputs and prints the resulting borrowing estimate.
 * Adds the buffer to the base interest rate before calculating. 
 * Logs errors during prompting or calculation and closes readline in the 
 * finally block.
 *
 * @param {number} [loan_term_months=360] - Loan duration used in the calculation.
 * @param {number} [interest_rate=7] - Base annual interest rate as a percentage.
 * @param {number} [assessment_rate_buffer=3] - Percentage points added to the rate.
 * @returns {Promise<void>} Resolves when the console interaction finishes.
 */
async function runConsoleMode(loan_term_months = LOAN_TERM_MONTHS, interest_rate = INTEREST_RATE, assessment_rate_buffer = ASSESSMENT_RATE_BUFFER) {
    const readline = require('node:readline/promises');
    
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log("Mortgage Borrowing Power Calculator");
    console.log("===================================");

    try {
        const income = await validateNumber("Gross Annual Income: $", rl, 0, 99999999, false);
        const dependents = await validateNumber("Number of Dependents (0 for no dependents): ", rl, 0, 10, true);
        const expenses = await validateNumber("Declared Monthly Expenses: $", rl, 0, 100000, false);
        const creditLimits = await validateNumber("Total Credit Card Limits: $", rl, 0, 2000000, false);

        // Banks assess loans using base rate + buffer for safety
        const assessmentRate = interest_rate + assessment_rate_buffer;

        const result = await BorrowingCalculator.calculateBorrowingPower(
            parseFloat(income),
            parseInt(dependents),
            parseFloat(expenses),
            parseFloat(creditLimits),
            assessmentRate,
            loan_term_months
        );

        console.log("\n--- Calculation Summary ---");
        console.log(`Maximum Borrowing Power at ${interest_rate}%: $${result.maxLoanAmount.toLocaleString()}`);
        console.log(`Assumed Monthly Mortgage Repayment: $${result.monthlyRepayment.toLocaleString()} over 30 years`);
    
    } 

    catch (error) {
        console.error("Error running calculation:", error.message);
        
    } 

    finally {
        rl.close();
    }
}

/**
 * Repeats a prompt until input is numeric and within the inclusive limits.
 * Trims whitespace, rejects empty input, and optionally requires a whole number if specified.
 * Prints feedback for invalid input before asking again.
 *
 * @param {string} prompt - Text displayed when requesting input.
 * @param {{question: (prompt: string) => Promise<string>}} rl - Readline interface
 * @param {number} lower_limit - Minimum accepted value, inclusive.
 * @param {number} upper_limit - Maximum accepted value, inclusive.
 * @param {boolean} [integerOnly=false] - Whether fractional numbers are rejected.
 * @returns {Promise<number>} Accepted input converted to a number.
 * @throws {Error} If reading input fails.
 */
async function validateNumber(prompt, rl, lower_limit, upper_limit, integerOnly = false) {
    let num_valid = false;
    let value = 0;

    //Reprompts user till a valid input is entered
    while (!num_valid) {
        const input = (await rl.question(prompt)).trim();
        value = Number(input);

        //Checks if the user input is not empty string, a NaN value or an improper value 
        if (input !== '' && !Number.isNaN(value) && (!integerOnly || Number.isInteger(value))) {
            if (value > upper_limit) {
                console.log(`Please enter a number less than or equal to ${upper_limit}.`);
            }
            else if (value < lower_limit) {
                console.log(`Please enter a number greater than or equal to ${lower_limit}.`);
            }
            else {
                num_valid = true;
            }
        }

        else {
            console.log(integerOnly ? "Please enter a non-negative whole number." : "Please enter a non-negative number.");
        }
    }

    return value;
}


if (require.main === module) {
    runConsoleMode();
}

module.exports = { BorrowingCalculator, CalculatorAPIHelper, validateNumber };
