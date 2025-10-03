import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle, 
  Link, 
  BarChart3, 
  Calendar, 
  Activity,
  Shield,
  Book,
  Users,
  Clock
} from 'lucide-react';

interface ComplianceDashboardData {
  organizationId: string;
  lastUpdateDate: string;
  overview: {
    totalManuals: number;
    totalParagraphs: number;
    complianceLinks: {
      total: number;
      active: number;
      questioned: number;
      invalid: number;
    };
    coverageStats: {
      globalCoverage: number;
      criticalCoverage: number;
      chapterCoverage: Array<{
        chapterId: string;
        coverage: number;
      }>;
    };
  };
  alerts: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    recent: Array<{
      id: string;
      alertType: string;
      severity: string;
      title: string;
      createdAt: string;
    }>;
  };
  upcomingDeadlines: Array<{
    id: string;
    type: string;
    title: string;
    deadline: string;
    severity: string;
  }>;
  recentActivities: Array<{
    type: string;
    description: string;
    user: string;
    timestamp: string;
  }>;
  trends: {
    coverageTrend: Array<{
      date: string;
      percentage: number;
    }>;
    alertTrend: Array<{
      date: string;
      count: number;
    }>;
  };
}

export default function ComplianceDashboard() {
  const [dashboardData, setDashboardData] = useState<ComplianceDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  // Mock data - in production, fetch from API
  useEffect(() => {
    const fetchDashboard = async () => {
      // Simulate API call
      setTimeout(() => {
        const mockData: ComplianceDashboardData = {
          organizationId: 'default-org',
          lastUpdateDate: new Date().toISOString(),
          overview: {
            totalManuals: 25,
            totalParagraphs: 1850,
            complianceLinks: {
              total: 1240,
              active: 1120,
              questioned: 85,
              invalid: 35,
            },
            coverageStats: {
              globalCoverage: 72,
              criticalCoverage: 95,
              chapterCoverage: [
                { chapterId: 'ch-1', coverage: 85 },
                { chapterId: 'ch-2', coverage: 68 },
                { chapterId: 'ch-3', coverage: 74 },
                { chapterId: 'ch-4', coverage: 62 },
              ],
            },
          },
          alerts: {
            critical: 3,
            high: 8,
            medium: 12,
            low: 25,
            recent: [
              {
                id: 'alert-1',
                alertType: 'REGULATION_UPDATE',
                severity: 'HIGH',
                title: 'EASA Part-ML Updated',
                createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
              },
              {
                id: 'alert-2',
                alertType: 'COMPLIANCE_GAP',
                severity: 'MEDIUM',
                title: 'Missing Maintenance Links',
                createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
              },
            ],
          },
          upcomingDeadlines: [
            {
              id: 'deadline-1',
              type: 'REGULATION_EFFECTIVE',
              title: 'EU-OPS 1.175 Implementation',
              deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
              severity: 'HIGH',
            },
            {
              id: 'deadline-2',
              type: 'AUDIT_DUE',
              title: 'Quarterly Compliance Review',
              deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              severity: 'MEDIUM',
            },
          ],
          recentActivities: [
            {
              type: 'LINK_CREATED',
              description: 'Compliance link created for FAR 121.445',
              user: 'John Smith',
              timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            },
            {
              type: 'ALERT_RESOLVED',
              description: 'EASA Part-ML update requirements implemented',
              user: 'Sarah Johnson',
              timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
            },
            {
              type: 'COVERAGE_IMPROVED',
              description: 'Manual coverage increased to 72%',
              user: 'System',
              timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
            },
          ],
          trends: {
            coverageTrend: [
              { date: '2024-01-01', percentage: 68 },
              { date: '2024-01-15', percentage: 70 },
              { date: '2024-02-01', percentage: 72 },
              { date: '2024-02-15', percentage: 72 },
            ],
            alertTrend: [
              { date: '2024-01-01', count: 35 },
              { date: '2024-01-15', count: 28 },
              { date: '2024-02-01', count: 22 },
              { date: '2024-02-15', count: 18 },
            ],
          },
        };

        setDashboardData(mockData);
        setLoading(false);
      }, 1000);
    };

    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading compliance dashboard...</p>
        </div>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-red-600">Failed to load dashboard data</p>
      </div>
    );
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'text-red-600 bg-red-100';
      case 'HIGH': return 'text-orange-600 bg-orange-100';
      case 'MEDIUM': return 'text-yellow-600 bg-yellow-100';
      case 'LOW': return 'text-blue-600 bg-blue-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return <AlertTriangle className="h-4 w-4" />;
      case 'HIGH': return <AlertTriangle className="h-4 w-4" />;
      case 'MEDIUM': return <AlertTriangle className="h-4 w-4" />;
      case 'LOW': return <AlertTriangle className="h-4 w-4" />;
      default: return <CheckCircle className="h-4 w-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Compliance Dashboard</h1>
            <p className="text-gray-600">Monitor regulatory compliance across your aircraft manuals</p>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-500">
              Last updated: {new Date(dashboardData.lastUpdateDate).toLocaleDateString('sv-SE')}
            </span>
          </div>
        </div>
      </header>

      <div className="p-6">
        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Book className="h-6 w-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Manuals</p>
                <p className="text-2xl font-bold text-gray-900">{dashboardData.overview.totalManuals}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <Link className="h-6 w-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Compliance Links</p>
                <p className="text-2xl font-bold text-gray-900">{dashboardData.overview.complianceLinks.total}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <TrendingUp className="h-6 w-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Global Coverage</p>
                <p className="text-2xl font-bold text-gray-900">{dashboardData.overview.coverageStats.globalCoverage}%</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Shield className="h-6 w-6 text-orange-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Critical Coverage</p>
                <p className="text-2xl font-bold text-gray-900">{dashboardData.overview.coverageStats.criticalCoverage}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Alerts Section */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-gray-900">Compliance Alerts</h2>
                <div className="flex space-x-2">
                  <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">
                    Critical: {dashboardData.alerts.critical}
                  </span>
                  <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">
                    High: {dashboardData.alerts.high}
                  </span>
                  <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full">
                    Medium: {dashboardData.alerts.medium}
                  </span>
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                    Low: {dashboardData.alerts.low}
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                {dashboardData.alerts.recent.map((alert) => (
                  <div key={alert.id} className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
                    <div className={`p-2 rounded-lg ${getSeverityColor(alert.severity)}`}>
                      {getSeverityIcon(alert.severity)}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{alert.title}</h4>
                      <p className="text-sm text-gray-600 capitalize">
                        {alert.alertType.toLowerCase().replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(alert.createdAt).toLocaleDateString('sv-SE')}
                      </p>
                    </div>
                    <button className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
                      View
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Chapter Coverage */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Chapter Coverage</h2>
              <div className="space-y-4">
                {dashboardData.overview.coverageStats.chapterCoverage.map((chapter) => (
                  <div key={chapter.chapterId} className="flex items-center space-x-4">
                    <div className="flex-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Chapter {chapter.chapterId}</span>
                        <span className="text-gray-900 font-medium">{chapter.coverage}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                        <div
                          className={`h-2 rounded-full ${
                            chapter.coverage >= 80 ? 'bg-green-500' :
                            chapter.coverage >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${chapter.coverage}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Upcoming Deadlines */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Upcoming Deadlines</h2>
              <div className="space-y-4">
                {dashboardData.upcomingDeadlines.map((deadline) => (
                  <div key={deadline.id} className="flex items-center space-x-3">
                    <div className={`p-2 rounded-lg ${getSeverityColor(deadline.severity)}`}>
                      <Calendar className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{deadline.title}</h4>
                      <p className="text-sm text-gray-600">
                        {new Date(deadline.deadline).toLocaleDateString('sv-SE')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activities */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Recent Activities</h2>
              <div className="space-y-4">
                {dashboardData.recentActivities.map((activity, index) => (
                  <div key={index} className="flex items-start space-x-3">
                    <div className="p-2 bg-gray-100 rounded-lg">
                      <Activity className="h-4 w-4 text-gray-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-900">{activity.description}</p>
                      <p className="text-xs text-gray-500">
                        {activity.user} • {new Date(activity.timestamp).toLocaleDateString('sv-SE')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-6">Quick Actions</h2>
              <div className="space-y-3">
                <button className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  Create Compliance Link
                </button>
                <button className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                  Run Impact Analysis
                </button>
                <button className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
                  Generate Coverage Report
                </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
);
}
