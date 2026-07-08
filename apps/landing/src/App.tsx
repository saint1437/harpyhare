import { Features } from "./components/Features";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { useLatestRelease } from "./hooks/useLatestRelease";

export default function App() {
  const release = useLatestRelease();
  return (
    <div className="min-h-screen bg-bg">
      <Header state={release} />
      <main>
        <Hero state={release} />
        <Features />
      </main>
      <Footer />
    </div>
  );
}
