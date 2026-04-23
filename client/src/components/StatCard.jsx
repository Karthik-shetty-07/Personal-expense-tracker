import { cn } from '../utils/cn';

export default function StatCard({ title, amount, icon: Icon, trend, trendValue, isCurrency = true, className }) {
  const isPositiveTrend = trend === 'up';

  return (
    <div className={cn("p-6 rounded-2xl bg-fin-surface border border-gray-800 shadow-sm relative overflow-hidden group", className)}>
      <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
        {Icon && <Icon className="w-24 h-24" />}
      </div>
      
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-gray-800/50 rounded-lg text-fin-muted">
          {Icon && <Icon className="w-5 h-5" />}
        </div>
        <h3 className="text-gray-400 font-medium text-sm">{title}</h3>
      </div>
      
      <div className="mt-4">
        <span className="text-3xl font-bold tracking-tight text-white">
          {isCurrency ? `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : amount}
        </span>
      </div>

      {trendValue && (
        <div className="mt-4 flex items-center text-sm">
          <span className={cn(
            "px-2 py-0.5 rounded-full font-medium text-xs mr-2",
            isPositiveTrend ? "bg-fin-accent/10 text-fin-accent" : "bg-fin-danger/10 text-fin-danger"
          )}>
            {isPositiveTrend ? '+' : '-'}{trendValue}%
          </span>
          <span className="text-gray-500">vs last month</span>
        </div>
      )}
    </div>
  );
}
