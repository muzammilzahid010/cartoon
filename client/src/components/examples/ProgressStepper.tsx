import ProgressStepper from "../ProgressStepper";

export default function ProgressStepperExample() {
  const steps = [
    { id: 1, title: "Story & Characters", description: "Input details" },
    { id: 2, title: "Generate Scenes", description: "AI processing" },
    { id: 3, title: "Review & Export", description: "View results" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted-foreground mb-4">Step 1 (Current)</p>
        <ProgressStepper currentStep={1} steps={steps} />
      </div>
      <div>
        <p className="text-sm text-muted-foreground mb-4">Step 2 (Current)</p>
        <ProgressStepper currentStep={2} steps={steps} />
      </div>
      <div>
        <p className="text-sm text-muted-foreground mb-4">Step 3 (Current)</p>
        <ProgressStepper currentStep={3} steps={steps} />
      </div>
    </div>
  );
}
