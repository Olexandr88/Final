#!/usr/bin/env node
const { add, subtract, multiply, divide } = require('../src/calculator');

const args = process.argv.slice(2);

if (args.length < 3) {
  console.log('Calculator CLI');
  console.log('Usage: calculator <number1> <operation> <number2>');
  console.log('Operations: +, -, *, /');
  console.log('Example: calculator 5 + 3');
  process.exit(0);
}

const a = parseFloat(args[0]);
const op = args[1];
const b = parseFloat(args[2]);

if (isNaN(a) || isNaN(b)) {
  console.error('Error: Invalid numbers');
  process.exit(1);
}

try {
  let result;
  switch(op) {
    case '+':
      result = add(a, b);
      break;
    case '-':
      result = subtract(a, b);
      break;
    case '*':
    case 'x':
      result = multiply(a, b);
      break;
    case '/':
      result = divide(a, b);
      break;
    default:
      console.error('Error: Unknown operation:', op);
      process.exit(1);
  }

  console.log(`${a} ${op} ${b} = ${result}`);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
