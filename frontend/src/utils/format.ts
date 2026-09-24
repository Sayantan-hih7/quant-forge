const currency = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
export const formatMoney = (value: number) => `${value < 0 ? '−' : ''}₹${currency.format(Math.abs(value))}`
export const formatCapital = (value: number) => value >= 10000000 ? `₹${(value / 10000000).toFixed(2)} Cr` : `₹${(value / 100000).toFixed(1)} L`
