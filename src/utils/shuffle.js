// Fisher-Yates (Knuth) shuffle — unbiased, in-place, O(n).
// Returns a new shuffled array; does not mutate the input.
function shuffleArray(arr) {
  const result = arr.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

module.exports = { shuffleArray };
