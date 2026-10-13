import Name from '@/components/recommend/Name'
import RecommendProducts from '@/components/recommend/RecommendProducts'
import FallBackRecommend from '@/components/recommend/FallBackRecommend'
import TriggerPages from '@/components/recommend/TriggerPages'
import TriggerProducts from '@/components/recommend/TriggerProducts'
import { useRecommendContext } from '@/context/pages/RecommendContext'
import { Button, FormLayout, Page } from '@shopify/polaris'
import '@/styles/recommend.css'
import Products from './product/Products'

const RecommendForm = () => {
  const { hookForm, slug, productsPassCondition } = useRecommendContext()

  const {
    submit,
    fields: { trigger },
  } = hookForm

  return (
    <Page fullWidth title="Recommendation section">
      <form className="recommend-form" onSubmit={submit}>
        <FormLayout>
          <Name />
          <TriggerPages />
          {trigger.value.pageIds.value.includes('4') && <TriggerProducts />}
          <RecommendProducts />
          {productsPassCondition?.data &&
          productsPassCondition?.data.length < 10 &&
          slug != 'create' ? (
            <FallBackRecommend />
          ) : (
            <></>
          )}
          {slug != 'create' && <Products />}

          <div className="recommend-form-actions">
            <Button size="large" submit variant="primary">
              {slug == 'create' ? 'Create' : 'Update'}
            </Button>
          </div>
        </FormLayout>
      </form>
    </Page>
  )
}

export default RecommendForm
