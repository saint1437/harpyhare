import { CtaSection } from "./components/CtaSection";
import { Features } from "./components/Features";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { HowItWorks } from "./components/HowItWorks";
import { Moon } from "./components/Moon";
import { useLatestRelease } from "./hooks/useLatestRelease";

export default function App() {
  const release = useLatestRelease();
  return (
    <div className="isolate min-h-screen bg-bg">
      <Moon />
      <Header state={release} />
      <main>
        <Hero state={release} />
        <HowItWorks />
        <Features />
        <CtaSection state={release} />
      </main>
      <Footer />
    </div>
  );
}
