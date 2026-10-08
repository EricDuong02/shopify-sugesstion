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
  {
    label: 'Chat monitoring',
    destination: '/chat',
  },
  {
    label: 'Chat config',
    destination: '/chat-config',
  },
]

export default function CustomNavigationMenu() {
  return <NavigationMenu navigationLinks={navigationLinks} />
}
