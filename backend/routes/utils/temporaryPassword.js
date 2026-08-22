const crypto = require('crypto');

const lower = 'abcdefghijkmnopqrstuvwxyz';
const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const digits = '23456789';
const special = '!@#$%^&*_-+=';
const all = `${lower}${upper}${digits}${special}`;

function randomCharacter(characters) {
  return characters[crypto.randomInt(characters.length)];
}

function generateTemporaryPassword(length = 16) {
  if (length < 12) throw new Error('Temporary passwords must be at least 12 characters.');
  const password = [randomCharacter(lower), randomCharacter(upper), randomCharacter(digits), randomCharacter(special)];
  while (password.length < length) password.push(randomCharacter(all));
  for (let index = password.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [password[index], password[swapIndex]] = [password[swapIndex], password[index]];
  }
  return password.join('');
}

module.exports = { generateTemporaryPassword };