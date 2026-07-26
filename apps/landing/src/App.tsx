import { CtaSection } from "./components/CtaSection";
import { Features } from "./components/Features";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { Hero } from "./components/Hero";
import { HowItWorks } from "./components/HowItWorks";
import { Moon } from "./components/Moon";
import { useLatestRelease } from "./hooks/useLatestRelease";
import { usePlatformSelection } from "./hooks/usePlatformSelection";

export default function App() {
  const release = useLatestRelease();
  const platformSelection = usePlatformSelection();
  return (
    <div className="isolate min-h-screen bg-bg">
      <Moon />
      <Header state={release} platform={platformSelection.platform} />
      <main>
        <Hero state={release} {...platformSelection} />
        <HowItWorks />
        <Features />
        <CtaSection state={release} {...platformSelection} />
      </main>
      <Footer platform={platformSelection.platform} />
    </div>
  );
}
