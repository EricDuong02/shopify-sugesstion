import { BrowserRouter } from 'react-router-dom'
import Routes from '@/Routes'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import {
  AppBridgeProvider,
  GraphQLProvider,
  PolarisProvider,
} from './components/providers'
import CustomNavigationMenu from './components/providers/NavigationMenu'

export default function App() {
  // Any .tsx or .jsx files in /pages will become a route
  // See documentation for <Routes /> for more info
  const pages = import.meta.glob('./pages/**/!(*.test.[jt]sx)*.([jt]sx)', {
    eager: true,
  })

  return (
    <PolarisProvider>
      <BrowserRouter>
        <AppBridgeProvider>
          <GraphQLProvider>
            <CustomNavigationMenu />
            <Routes pages={pages} />
            <ReactQueryDevtools />
          </GraphQLProvider>
        </AppBridgeProvider>
      </BrowserRouter>
    </PolarisProvider>
  )
}
