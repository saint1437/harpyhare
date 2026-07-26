import { CtaSection } from "./components/CtaSection";
import { Features } from "./components/Features";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { HowItWorks } from "./components/HowItWorks";
import { Moon } from "./components/Moon";
import { useLatestRelease } from "./hooks/useLatestRelease";
import { PLATFORM } from "./lib/platform";

export default function App() {
  const release = useLatestRelease();
  return (
    <div className="isolate min-h-screen bg-bg">
      <Moon />
      <Header state={release} platform={PLATFORM} />
      <main>
        <Hero state={release} platform={PLATFORM} />
        <HowItWorks />
        <Features />
        <CtaSection state={release} platform={PLATFORM} />
      </main>
      <Footer platform={PLATFORM} />
    </div>
  );
}
