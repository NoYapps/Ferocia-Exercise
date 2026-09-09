/**
 * Borrowing Power Calculator
 * 
 * Gen's incomplete prototype. 
 * This currently calculates what a user can borrow over 30 years.
 * Currently this code uses placeholder methods for Tax and HEM values. 
 * 
 * TODO: Refactor the code to pull Tax and HEM values from an API call.
 * A server.js has been provided to supply these values.
 */

//TODO
//2. Edit readme
//3. Add unit test cases for BorrowingCalculator and CalculatorHelper
//4. Relavent Documentation for the code and methods

require('dotenv').config()

// Global constant for mortgage simulation
const LOAN_TERM_MONTHS = 360; // 30 Years
const INTEREST_RATE = 7.0; // 7.0% baseline interest rate
const ASSESSMENT_RATE_BUFFER = 3.0; // 3.0% buffer added to interest rates
const CREDIT_LIABILITY = 0.03; // 3% of of total of credit

class CalculatorAPIHelper {
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
        }
        catch(error){
            throw new Error(`Could not reach API server`);
        }

        return response
    }
}

class BorrowingCalculator {
    /**
     * Calculates the total borrowing power amount and the monthly repayment configuration
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
        // P = M * (1 - (1 + R)^-N) / R
        const maxLoanAmount = maxMonthlyRepayment * ((1 - Math.pow(1 + monthlyRate, - loan_term_months)) / monthlyRate);

        return {
            maxLoanAmount: Number(maxLoanAmount.toFixed(2)),
            monthlyRepayment: Number(maxMonthlyRepayment.toFixed(2))
        };
    }
}

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

async function validateNumber(prompt, rl, lower_limit, upper_limit, integerOnly = false) {
    let num_valid = false;
    let value = 0;
    while (!num_valid) {
        const input = (await rl.question(prompt)).trim();
        value = Number(input);

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

module.exports = { BorrowingCalculator, CalculatorAPIHelper };