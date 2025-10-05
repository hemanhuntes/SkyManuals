'use client';

import React, { useState, useEffect } from 'react';
import {
  PageContainer,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui';
import { 
  Search, 
  Filter, 
  Download, 
  Settings, 
  Eye, 
  AlertTriangle, 
  CheckCircle, 
  Clock,
  ExternalLink,
  Activity,
  Users,
  DollarSign,
  TrendingUp,
} from 'lucide-react';
import {
  Addon,
  Installation,
  License,
  AddonType,
  LicenseTier,
  InstallStatus,
  HookExecution,
} from '@skymanuals/types';

interface AddonDashboard {
  installations: Installation[];
  licenses: License[];
  recentActivities: Activity[];
  analytics: {
    totalAddonsInstalled: number;
    activeTrials: number;
    monthlyRevenue: number;
    installationsThisMonth: number;
  };
}

interface Activity {
  id: string;
  type: 'INSTALLATION' | 'UNINSTALLATION' | 'TRIAL_STARTED' | 'TRIAL_EXPIRED' | 'LICENSE_PURCHASED';
  timestamp: string;
  addonName: string;
  organizationId: string;
  organizationName: string;
  details?: string;
}

export default function AddonManagementPage() {
  const [dashboard, setDashboard] = useState<AddonDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('overview');
  const [selectedAddon, setSelectedAddon] = useState<Addon | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      const organizationId = localStorage.getItem('current_organization_id');
      
      const response = await fetch(`/api/addons/organization/${organizationId}/dashboard`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('session_token')}`,
          'x-org-id': organizationId || '',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load dashboard data');
      }

      const data = await response.json();
      setDashboard(data);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEnableTrial = async (licenseId: string) => {
    try {
      const response = await fetch(`/api/addons/licenses/${licenseId}/enable-trial`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('session_token')}`,
          'x-org-id': localStorage.getItem('current_organization_id') || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          trialDays: 14,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to enable trial');
      }

      await loadDashboardData();
    } catch (error) {
      console.error('Failed to enable trial:', error);
    }
  };

  const handleManageSeats = async (licenseId: string, newSeats: number) => {
    try {
      const response = await fetch(`/api/addons/licenses/${licenseId}/update-seats`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('session_token')}`,
          'x-org-id': localStorage.getItem('current_organization_id') || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          seatsPurchased: newSeats,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update seats');
      }

      await loadDashboardData();
    } catch (error) {
      console.error('Failed to update seats:', error);
    }
  };

  const getStatusBadge = (status: string, statusType: 'installation' | 'license') => {
    const variants = {
      installation: {
        ACTIVE: 'default',
        INSTALLED: 'secondary',
        INACTIVE: 'outline',
        UNINSTALLED: 'destructive',
        ERROR: 'destructive',
      },
      license: {
        ACTIVE: 'default',
        TRIAL: 'secondary',
        EXPIRED: 'destructive',
        SUSPENDED: 'outline',
      },
    };

    const colors = {
      ACTIVE: 'bg-green-100 text-green-800',
      INSTALLED: 'bg-blue-100 text-blue-800',
      INACTIVE: 'bg-gray-100 text-gray-800',
      TRIAL: 'bg-yellow-100 text-yellow-800',
      EXPIRED: 'bg-red-100 text-red-800',
      ERROR: 'bg-red-100 text-red-800',
    };

    const variant = variants[statusType][status as keyof typeof variants[typeof statusType]] || 'outline';
    const color = colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';

    return (
      <Badge variant={variant} className={color}>
        {status.replace('_', ' ')}
      </Badge>
    );
  };

  const getActivityIcon = (type: string) => {
    const icons = {
      INSTALLATION: CheckCircle,
      UNINSTALLATION: AlertTriangle,
      TRIAL_STARTED: Clock,
      TRIAL_EXPIRED: AlertTriangle,
      LICENSE_PURCHASED: DollarSign,
    };

    const Icon = icons[type as keyof typeof icons] || Activity;
    return <Icon className="h-4 w-4" />;
  };

  if (loading) {
    return (
      <PageContainer>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </PageContainer>
    );
  }

  if (!dashboard) {
    return (
      <PageContainer>
        <Alert className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load add-on management dashboard. Please try refreshing the page.
          </AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="space-y-6">
      <div className="md:flex md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Add-on Management</h1>
          <p className="text-gray-600 mt-1">
            Manage your organization's add-ons, trials, and subscriptions
          </p>
        </div>
        <div className="mt-4 md:mt-0">
          <Button onClick={() => window.open('/store', '_blank')}>
            <ExternalLink className="h-4 w-4 mr-2" />
            Browse Add-on Store
          </Button>
        </div>
      </div>

      {/* Analytics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-500">Total Installed</h3>
                <p className="text-2xl font-bold text-gray-900">
                  {dashboard.analytics.totalAddonsInstalled}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Clock className="h-8 w-8 text-yellow-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-500">Active Trials</h3>
                <p className="text-2xl font-bold text-gray-900">
                  {dashboard.analytics.activeTrials}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <TrendingUp className="h-8 w-8 text-blue-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-500">This Month</h3>
                <p className="text-2xl font-bold text-gray-900">
                  +{dashboard.analytics.installationsThisMonth}
                </p>
                <p className="text-xs text-gray-500">new installations</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <DollarSign className="h-8 w-8 text-green-600" />
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-500">Monthly Spend</h3>
                <p className="text-2xl font-bold text-gray-900">
                  ${dashboard.analytics.monthlyRevenue.toFixed(2)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="installations">Installations</TabsTrigger>
          <TabsTrigger value="licenses">Licenses</TabsTrigger>
          <TabsTrigger value="trials">Trials</TabsTrigger>
          <TabsTrigger value="logs">Webhook Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>
                Latest add-on installation and management activities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {dashboard.recentActivities.slice(0, 10).map((activity) => (
                  <div key={activity.id} className="flex items-center space-x-3 p-3 border rounded-lg">
                    <div className="flex-shrink-0">
                      {getActivityIcon(activity.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">
                          {activity.addonName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(activity.timestamp).toLocaleDateString()}
                        </p>
                      </div>
                      <p className="text-sm text-gray-500">
                        {activity.type.replace('_', ' ')} • {activity.organizationName}
                      </p>
                      {activity.details && (
                        <p className="text-xs text-gray-400 mt-1">{activity.details}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="installations" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Installed Add-ons</CardTitle>
              <CardDescription>
                Manage your organization's add-on installations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Add-on</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Installed</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.installations.map((installation) => (
                    <TableRow key={installation.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{installation.addon.name}</div>
                          <div className="text-sm text-gray-500">{installation.addon.description}</div>
                        </div>
                      </TableCell>
                      <TableCell>{installation.installedVersion}</TableCell>
                      <TableCell>{getStatusBadge(installation.status, 'installation')}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {new Date(installation.installedAt).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedAddon(installation.addon);
                              setShowDetailsDialog(true);
                            }}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Details
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              // Handle configuration
                              console.log('Configure add-on:', installation.id);
                            }}
                          >
                            <Settings className="h-4 w-4 mr-1" />
                            Configure
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="licenses" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Licenses & Subscriptions</CardTitle>
              <CardDescription>
                Manage add-on licenses and subscription plans
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Add-on</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Seats</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dashboard.licenses.map((license) => (
                    <TableRow key={license.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{license.addon.name}</div>
                          <div className="text-sm text-gray-500">{license.tier}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{license.tier}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {license.seatsUsed} / {license.seatsPurchased}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {license.endDate 
                            ? new Date(license.endDate).toLocaleDateString()
                            : 'Perpetual'
                          }
                        </div>
                      </TableCell>
                      <TableCell>
                        {license.isTrial ? (
                          getStatusBadge('TRIAL', 'license')
                        ) : (
                          getStatusBadge(license.isActive ? 'ACTIVE' : 'EXPIRED', 'license')
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-x-2">
                          {license.isTrial && (
                            <Button
                              size="sm"
                              onClick={() => handleEnableTrial(license.id)}
                            >
                              Convert Trial
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const newSeats = prompt('Enter new seat count:', license.seatsPurchased.toString());
                              if (newSeats) {
                                handleManageSeats(license.id, parseInt(newSeats));
                              }
                            }}
                          >
                            Manage Seats
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trials" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Trials & Expiring Licenses</CardTitle>
              <CardDescription>
                Monitor trial periods and upcoming license renewals
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {dashboard.licenses
                  .filter(license => license.isTrial || 
                    (license.endDate && new Date(license.endDate) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)))
                  .map((license) => (
                  <div key={license.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">{license.addon.name}</h3>
                        <p className="text-sm text-gray-500">{license.tier} tier</p>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">
                          {license.isTrial ? 'Trial expires' : 'License expires'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {new Date(license.endDate || license.trialEndsAt || '').toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    {license.isTrial && (
                      <div className="mt-3">
                        <Button size="sm">
                          Convert to Full License
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Webhook Execution Logs</CardTitle>
              <CardDescription>
                Monitor webhook calls and integration events
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Recent Activity</h3>
                <p className="text-gray-500">
                  Webhook execution logs will appear here when add-ons trigger events.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add-on Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedAddon?.name}</DialogTitle>
            <DialogDescription>
              {selectedAddon?.description}
            </DialogDescription>
          </DialogHeader>
          {selectedAddon && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Version</Label>
                  <div className="text-sm text-gray-600">{selectedAddon.version}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Type</Label>
                  <div className="text-sm text-gray-600">{selectedAddon.type}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Author</Label>
                  <div className="text-sm text-gray-600">{selectedAddon.author}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium">Status</Label>
                  <div className="text-sm">
                    <Badge variant="outline">{selectedAddon.status}</Badge>
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">Tags</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {selectedAddon.tags?.map((tag) => (
                    <Badge key={tag} variant="secondary">{tag}</Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setShowDetailsDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}






