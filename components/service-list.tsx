"use client";

import type { Service } from "@/lib/domain/types";
import { formatCurrency } from "@/lib/utils/currency";

interface ServiceListProps {
  services: Service[];
  currency: string;
  onSelect?: (service: Service) => void;
  selectedServiceId?: string;
}

export function ServiceList({ services, currency, onSelect, selectedServiceId }: ServiceListProps) {
  if (services.length === 0) {
    return <p className="text-sm text-slate-400">No services published yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {services.map((service) => {
        const isSelected = service.id === selectedServiceId;
        return (
          <button
            key={service.id}
            type="button"
            onClick={() => onSelect?.(service)}
            className={`rounded-lg border px-4 py-3 text-left transition ${
              isSelected ? "border-accent bg-accent/10 text-white" : "border-slate-800 bg-slate-900 hover:border-accent/50"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">{service.name}</h3>
                {service.description ? (
                  <p className="mt-1 text-sm text-slate-300">{service.description}</p>
                ) : null}
              </div>
              <div className="text-right text-sm text-accent">
                <p className="font-semibold">{formatCurrency(service.basePriceCents, currency)}</p>
                <p className="text-xs text-slate-400">{service.durationMin} min</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
