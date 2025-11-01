import { Check } from "lucide-react";

interface Step {
  id: number;
  title: string;
  description: string;
}

interface ProgressStepperProps {
  currentStep: number;
  steps: Step[];
}

export default function ProgressStepper({ currentStep, steps }: ProgressStepperProps) {
  return (
    <div className="sticky top-0 z-40 bg-[#1e2838]/90 dark:bg-[#181e2a]/90 backdrop-blur-md border-b border-white/10">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const isCompleted = currentStep > step.id;
            const isCurrent = currentStep === step.id;
            const isUpcoming = currentStep < step.id;
            
            return (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div className="flex items-center w-full">
                    <div 
                      className={`
                        relative flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full border-2 transition-all
                        ${isCompleted ? "bg-primary border-primary text-primary-foreground" : ""}
                        ${isCurrent ? "bg-primary border-primary text-primary-foreground scale-110" : ""}
                        ${isUpcoming ? "bg-white/5 border-white/20 text-gray-400" : ""}
                      `}
                      data-testid={`step-indicator-${step.id}`}
                    >
                      {isCompleted ? (
                        <Check className="w-5 h-5 md:w-6 md:h-6" />
                      ) : (
                        <span className="font-semibold text-sm md:text-base">{step.id}</span>
                      )}
                    </div>
                    
                    {index < steps.length - 1 && (
                      <div className="flex-1 h-0.5 mx-2">
                        <div 
                          className={`h-full transition-all ${
                            isCompleted ? "bg-primary" : "bg-white/20"
                          }`}
                        />
                      </div>
                    )}
                  </div>
                  
                  <div className="mt-3 text-center hidden md:block">
                    <div className={`text-sm font-semibold ${isCurrent ? "text-white" : "text-gray-300"}`}>
                      {step.title}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {step.description}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
