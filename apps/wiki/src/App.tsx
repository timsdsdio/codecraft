import { Route, Router, Switch } from 'wouter';
import { Layout } from './wiki/Layout';
import { AllPages, CategoryView, PageView, SceneView, WantedPages } from './wiki/views';

export default function App() {
  return (
    <Router base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <Layout>
        <Switch>
          <Route path="/">{() => <PageView slug="main-page" />}</Route>
          <Route path="/wiki/:slug">{(p) => <PageView key={p.slug} slug={p.slug} />}</Route>
          <Route path="/category/:name">{(p) => <CategoryView name={decodeURIComponent(p.name)} />}</Route>
          <Route path="/special/all-pages" component={AllPages} />
          <Route path="/special/wanted-pages" component={WantedPages} />
          <Route path="/special/scene/:name">{(p) => <SceneView name={p.name} />}</Route>
          <Route>{() => <PageView slug="not-found" />}</Route>
        </Switch>
      </Layout>
    </Router>
  );
}
