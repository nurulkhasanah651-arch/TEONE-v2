// Generate 6-character hex ID matching v1 format (e.g., '141A31', '8B66D5')

export function generateTripId() {
  const hex = '0123456789ABCDEF';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += hex[Math.floor(Math.random() * 16)];
  }
  return id;
}
