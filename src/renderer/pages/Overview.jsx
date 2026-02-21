import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';

export default function Overview() {
  const [stats, setStats] = useState({ companies: 0, parties: 0, items: 0, orders: 0 });
  const [userDataPath, setUserDataPath] = useState('');

  useEffect(() => {
    const load = async () => {
      const [companies, parties, items, orders] = await Promise.all([
        window.vyapar.listCompanies(),
        window.vyapar.listParties(),
        window.vyapar.listItems(),
        window.vyapar.listOrders()
      ]);
      setStats({
        companies: companies.length,
        parties: parties.length,
        items: items.length,
        orders: orders.length
      });
    };
    load();
    window.vyapar.getUserDataPath().then(setUserDataPath).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="section-title text-3xl font-semibold">Operations Overview</h2>
        <p className="text-muted">Track your company, parties, and order flow at a glance.</p>
        {userDataPath ? (
          <p className="mt-2 text-xs text-muted">DB path: {userDataPath}/vyapar.db</p>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Companies', value: stats.companies },
          { label: 'Parties', value: stats.parties },
          { label: 'Items', value: stats.items },
          { label: 'Orders', value: stats.orders }
        ].map((card) => (
          <Card key={card.label}>
            <CardHeader>
              <CardTitle>{card.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-semibold text-ink">{card.value}</p>
              <p className="text-xs text-muted">updated now</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Next Steps</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-5 text-sm text-muted">
            <li>Complete company GST + drug license details.</li>
            <li>Add parties and define party-wise rates.</li>
            <li>Create items with HSN and GST to speed up order entry.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
