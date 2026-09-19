export const cryptoMethods = [
  { id: 'USDT-TRC20', asset: 'USDT', chain: 'TRON', label: 'TRON · TRC20', address: 'T…', explorer: 'https://tronscan.org/#/transaction/', family: 'tron' },
  { id: 'USDT-BEP20', asset: 'USDT', chain: 'BNB Smart Chain', label: 'BNB Smart Chain · BEP20', address: '0x…', explorer: 'https://bscscan.com/tx/', family: 'evm' },
  { id: 'USDT-ERC20', asset: 'USDT', chain: 'Ethereum', label: 'Ethereum · ERC20', address: '0x…', explorer: 'https://etherscan.io/tx/', family: 'evm' },
  { id: 'USDC-POLYGON', asset: 'USDC', chain: 'Polygon', label: 'Polygon', address: '0x…', explorer: 'https://polygonscan.com/tx/', family: 'evm' },
  { id: 'USDC-BASE', asset: 'USDC', chain: 'Base', label: 'Base', address: '0x…', explorer: 'https://basescan.org/tx/', family: 'evm' },
  { id: 'USDC-ERC20', asset: 'USDC', chain: 'Ethereum', label: 'Ethereum · ERC20', address: '0x…', explorer: 'https://etherscan.io/tx/', family: 'evm' },
];
export const methodById = id => cryptoMethods.find(m => m.id === id);
export const enabledMethods = settings => cryptoMethods.filter(m => (settings.withdrawalNetworks ?? cryptoMethods.map(n => n.id)).includes(m.id));
export function validAddress(id, address) {
  const method = methodById(id);
  return method?.family === 'tron' ? /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address) : method?.family === 'evm' && /^0x[0-9a-fA-F]{40}$/.test(address) && !/^0x0{40}$/i.test(address);
}
export function validTransaction(id, value) {
  const method = methodById(id);
  return method?.family === 'tron' ? /^[0-9a-fA-F]{64}$/.test(value) : method?.family === 'evm' && /^0x[0-9a-fA-F]{64}$/.test(value);
}
export function transactionUrl(id, tx) { return validTransaction(id, tx) ? methodById(id).explorer + tx : null; }
