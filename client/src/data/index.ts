export const listModule = [
  {
    value: '1',
    label: 'Best Sellers',
  },
  {
    value: '2',
    label: 'New Arrival',
  },
  {
    value: '3',
    label: 'Clearance',
  },
  {
    value: '4',
    label: 'Hottest Trends',
  },
  {
    value: '5',
    label: 'Most Valuable Products',
  },
  {
    value: '6',
    label: 'Recently Viewed Products',
  },
  {
    value: '7',
    label: 'Selected for You',
  },
  {
    value: '8',
    label: 'Similar Items/You May Also Like',
  },
  {
    value: '9',
    label: 'Substitute Products',
  },
  {
    value: '10',
    label: 'Frequently Bought Together',
  },
  {
    value: '11',
    label: 'Purchased with Last Purchased',
  },
  {
    value: '12',
    label: 'Bundle Deals',
  },
  {
    value: '13',
    label: 'Complete the Look',
  },
  {
    value: '14',
    label: 'Limited Edition',
  },
  {
    value: '15',
    label: 'Price Drop',
  },
  {
    value: '16',
    label: 'User-Specific Discounts',
  },
  {
    value: '17',
    label: 'Wishlist Reminders',
  },
  {
    value: '18',
    label: 'Social Proof',
  },
  {
    value: '19',
    label: 'Pre-Order',
  },
]

export const listAttribute = [
  {
    value: '0',
    label: 'SKU',
    conditions: ['3', '4'],
  },
  {
    value: '1',
    label: 'Created Date',
    conditions: ['1', '2'],
  },
  {
    value: '2',
    label: 'Sales',
    conditions: ['1', '2'],
  },
  {
    value: '3',
    label: 'Quantity Sold',
    conditions: ['1', '2'],
  },
  {
    value: '4',
    label: 'Category',
    conditions: ['3', '4'],
  },
  { value: '5', label: 'Brand', conditions: ['3', '4'] },
  { value: '6', label: 'Discount Range', conditions: ['1', '2'] },
  { value: '7', label: 'Sales Date', conditions: ['1', '2'] },
  {
    value: '8',
    label: 'Product Impression',
    conditions: ['1', '2'],
  },
  {
    value: '9',
    label: 'Add to cart rate',
    conditions: ['1', '2'],
  },
  {
    value: '10',
    label: 'Available quantity',
    conditions: ['1', '2'],
  },
  {
    value: '11',
    label: 'Revenue per visit',
    conditions: ['1', '2'],
  },
  {
    value: '12',
    label: 'Ratings',
    conditions: ['1', '2'],
  },
  //list auto recommendation
  {
    value: '13',
    label: 'Purchased with Last Purchased',
    conditions: [],
  },
  {
    value: '14',
    label: 'Bundle Deals',
    conditions: [],
  },
  {
    value: '15',
    label: 'Wishlist Reminders',
    conditions: [],
  },
  {
    value: '16',
    label: 'Pre orders',
    conditions: [],
  },
]

export const listConditions = [
  { value: '1', label: 'is equal or greater than' },
  { value: '2', label: 'is equal or less than' },
  { value: '3', label: 'is one of' },
  { value: '4', label: 'is not one of' },
]

export const pageOptions = [
  { value: '1', label: 'Home page' },
  { value: '2', label: 'Cart page' },
  { value: '3', label: 'Collection pages' },
  { value: '4', label: 'Product pages' },
]

export const typeProduct = [
  { value: '1', label: 'Any products' },
  // { value: '2', label: 'Specific products' },
  { value: '3', label: 'Collections & conditions' },
]

export const typeRecommended = [
  { value: '1', label: 'Auto Recommend' },
  { value: '2', label: 'Specific products' },
  { value: '3', label: 'Collections & conditions' },
]
