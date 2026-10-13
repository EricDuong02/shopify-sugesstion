import useRecommend from '@/hooks/recommend/useRecommend'
import type { ReactNode } from 'react'
import { createContext, useContext } from 'react'

const recommendContext = createContext<ReturnType<typeof useRecommend> | null>(
  null
)

export const RecommendContext = ({ children }: { children: ReactNode }) => {
  const hook = useRecommend()

  return (
    <recommendContext.Provider value={hook}>
      {children}
    </recommendContext.Provider>
  )
}

export const useRecommendContext = () => {
  const context = useContext(recommendContext)
  if (context === null) {
    throw new Error(
      'useRecommendContext must be used within a RecommendProvider'
    )
  }

  return context
}
