import React, { useEffect, useState } from 'react';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Label from '../components/ui/Label';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';

export default function Overview() {
  const [stats, setStats] = useState({ companies: 0, parties: 0, items: 0, orders: 0 });
  const [userDataPath, setUserDataPath] = useState('');
  const [backupPath, setBackupPath] = useState('');
  const [backupStatus, setBackupStatus] = useState('');
  const [backuping, setBackuping] = useState(false);

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

  const createBackup = async () => {
    setBackuping(true);
    setBackupStatus('');
    try {
      const result = await window.vyapar.exportDatabase(backupPath);
      setBackupStatus(`Backup created at ${result?.path || 'unknown path'}`);
      if (result?.path) setBackupPath(result.path);
    } catch (error) {
      setBackupStatus(`Backup failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setBackuping(false);
    }
  };

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
          <CardTitle>Database Backup</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-2">
              <Label>Backup Path (optional)</Label>
              <Input
                value={backupPath}
                onChange={(event) => setBackupPath(event.target.value)}
                placeholder="Leave blank to save in Downloads"
              />
            </div>
            <div className="flex items-end">
              <Button type="button" onClick={createBackup} className="w-full" disabled={backuping}>
                {backuping ? 'Creating...' : 'Create Backup'}
              </Button>
            </div>
          </div>
          {backupStatus ? <p className="mt-3 text-sm text-muted">{backupStatus}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
