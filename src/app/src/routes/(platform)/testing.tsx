'use client';

import { useState } from 'react';
import { Button } from '#/components/ui/button';
import { BarChart3, Shield } from 'lucide-react';

export default function Home() {
  const [activeTab, setActiveTab] = useState('overview');

  const menuItems = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'security', label: 'Security', icon: Shield },
  ];

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-card">
        <div className="p-6">
          <h2 className="text-lg font-semibold">Menu</h2>
        </div>
        <nav className="space-y-2 px-3">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.id}
                variant={activeTab === item.id ? 'default' : 'ghost'}
                className="w-full justify-start gap-2"
                onClick={() => setActiveTab(item.id)}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Button>
            );
          })}
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8">
        <h1 className="text-3xl font-bold mb-4">
          {activeTab === 'overview' && 'Overview'}
          {activeTab === 'security' && 'Security'}
        </h1>
        <p className="text-muted-foreground">
          {activeTab === 'overview' && 'Welcome to the Overview section.'}
          {activeTab === 'security' && 'Manage your security settings here.'}
        </p>
      </div>
    </div>
  );
}
