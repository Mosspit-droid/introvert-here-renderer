// Turn the app's prices + settings into the cell values for PRODUCT_RULES (Q = price, AW/AX = 2XL/3XL extras) and PRICING (C3:C5).
const types = JSON.parse(input.types).map(r => String(r[1]).trim());
const prices = JSON.parse(input.prices), st = JSON.parse(input.settings);
const q = [], x = [];
types.forEach(t => {
  const p = prices[t];
  if (!p) throw new Error("No price sent for " + t);
  q.push([p.price]); x.push([p.x2, p.x3]);
});
return {
  q: JSON.stringify({ values: q }),
  x: JSON.stringify({ values: x }),
  s: JSON.stringify({ values: [[st.target], [st.rate], [st.card]] }),
};
