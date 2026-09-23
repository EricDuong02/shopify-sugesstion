import RecommendForm from '@/components/recommend'
import { RecommendContext } from '@/context/pages/RecommendContext'

const MyForm = () => {
  return (
    <RecommendContext props={undefined}>
      <RecommendForm />
    </RecommendContext>
  )
}

export default MyForm
