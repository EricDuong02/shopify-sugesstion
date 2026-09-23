import { NavigationMenu } from '@shopify/app-bridge-react'

const navigationLinks = [
  {
    label: 'Recommend',
    destination: '/recommend',
  },
  {
    label: 'Generate token',
    destination: '/token',
  },
]

export default function CustomNavigationMenu() {
  return <NavigationMenu navigationLinks={navigationLinks} />
}
