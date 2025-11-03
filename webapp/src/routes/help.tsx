import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/help")({ component: HelpPage });

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-gray-50 border border-gray-200 rounded p-3 text-xs whitespace-pre-wrap">
      {children}
    </pre>
  );
}

function HelpPage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-4">Help & Terminology</h1>
      <p className="text-gray-600 mb-8">
        This page explains key terms and how values shown in the UI are calculated.
      </p>

      <div className="space-y-8">
        <section>
          <h2 className="text-xl font-semibold mb-2">Budget</h2>
          <p className="text-gray-700 mb-2">
            Monthly budget tracks how much you can allocate to new predictions.
          </p>
          <ul className="list-disc ml-6 text-gray-700 space-y-1">
            <li>
              <strong>Total Budget</strong>: Sum of all strategies&apos; monthly budgets.
            </li>
            <li>
              <strong>Spent</strong>: Sum of <em>allocatedAmount</em> for predictions marked as
              <em>entered</em> in the current month.
            </li>
            <li>
              <strong>Remaining</strong>: Total Budget − Spent.
            </li>
            <li>
              <strong>Utilization</strong>: Spent ÷ Total Budget.
            </li>
          </ul>
          <div className="mt-3">
            <div className="text-xs font-medium text-gray-500 mb-1">Formula</div>
            <CodeBlock>{`totalBudget = sum(strategy.monthlyBudget)
spent = sum(pred.allocatedAmount where pred.action == 'entered' and pred.createdAt in current month)
remaining = totalBudget - spent
utilizationPct = (spent / totalBudget) * 100`}</CodeBlock>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Account Value</h2>
          <p className="text-gray-700 mb-2">
            Account Value combines active positions&apos; current value with remaining cash budget.
          </p>
          <ul className="list-disc ml-6 text-gray-700 space-y-1">
            <li>
              <strong>Active Positions Value</strong>: For each entered & active prediction,
              multiply its entry cost by (1 + current return%).
            </li>
            <li>
              <strong>Unrealized P/L</strong>: Active Positions Value − Entry Cost.
            </li>
            <li>
              <strong>Total Account Value</strong>: Active Positions Value + Remaining Cash Budget.
            </li>
          </ul>
          <div className="mt-3">
            <div className="text-xs font-medium text-gray-500 mb-1">Formula</div>
            <CodeBlock>{`activePositions = filter(predictions, action == 'entered' and status == 'active')
positionValue = allocatedAmount * (1 + returnPct/100)
activePositionsValue = sum(positionValue)
unrealizedPL = activePositionsValue - sum(allocatedAmount)
totalAccountValue = activePositionsValue + remainingBudget`}</CodeBlock>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Performance Metrics</h2>
          <ul className="list-disc ml-6 text-gray-700 space-y-1">
            <li>
              <strong>Hit Rate</strong>: wins ÷ closed.
            </li>
            <li>
              <strong>Average Return</strong>: Mean return of closed predictions.
            </li>
            <li>
              <strong>Realized P/L</strong>: Sum(entryCost × return%).
            </li>
          </ul>
        </section>

        <div className="pt-4">
          <Link to="/dashboard" className="text-blue-600 hover:text-blue-700">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

export default HelpPage;
