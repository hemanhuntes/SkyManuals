'use client';

import React, { useState, useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { User, Building2, ChevronDown } from 'lucide-react';
import {
  OrganizationContext,
  UserSession,
} from '@skymanuals/types';

interface OrgSwitcherProps {
  currentSession: UserSession;
  onOrgSwitch: (organizationId: string) => void;
  loading?: boolean;
}

export function OrgSwitcher({ currentSession, onOrgSwitch, loading }: OrgSwitcherProps) {
  const [selectedOrgId, setSelectedOrgId] = useState(currentSession.currentOrganization.id);
  const [isChanging, setIsChanging] = useState(false);

  useEffect(() => {
    setSelectedOrgId(currentSession.currentOrganization.id);
  }, [currentSession.currentOrganization.id]);

  const handleOrgChange = async (orgId: string) => {
    if (orgId === currentSession.currentOrganization.id) {
      return; // Already selected
    }

    setIsChanging(true);
    try {
      await onOrgSwitch(orgId);
      setSelectedOrgId(orgId);
    } catch (error) {
      console.error('Failed to switch organization:', error);
      // Reset to current org on failure
      setSelectedOrgId(currentSession.currentOrganization.id);
    } finally {
      setIsChanging(false);
    }
  };

  const getRoleBadge = (role: string) => {
    const variants = {
      ADMIN: 'destructive',
      EDITOR: 'default',
      REVIEWER: 'secondary',
      READER: 'outline',
    };
    
    return (
      <Badge variant={variants[role as keyof typeof variants] || 'outline'} className="ml-2">
        {role}
      </Badge>
    );
  };

  return (
    <div className="flex items-center space-x-2">
      <User className="h-4 w-4 text-gray-500" />
      
      <Select 
        value={selectedOrgId} 
        onValueChange={handleOrgChange}
        disabled={loading || isChanging}
      >
        <SelectTrigger className="w-[280px]">
          <SelectValue>
            <div className="flex items-center">
              <Building2 className="h-4 w-4 mr-2" />
              <span className="truncate">
                {currentSession.availableOrganizations.find(
                  org => org.id === selectedOrgId
                )?.name || 'Select Organization'}
              </span>
              {loading || isChanging ? (
                <div className="ml-2 h-3 w-3 animate-spin rounded-full border-1 border-gray-400 border-t-transparent" />
              ) : (
                <ChevronDown className="h-4 w-4 ml-2" />
              )}
            </div>
          </SelectValue>
        </SelectTrigger>
        
        <SelectContent>
          {currentSession.availableOrganizations.map((org) => (
            <SelectItem key={org.id} value={org.id}>
              <div className="flex items-center justify-between w-full">
                <div className="flex flex-col">
                  <span className="font-medium">{org.name}</span>
                  <span className="text-xs text-gray-500">{org.slug}</span>
                </div>
                {getRoleBadge(org.role)}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface UserProfileProps {
  session: UserSession;
}

export function UserProfile({ session }: UserProfileProps) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('session_token')}`,
        },
        body: JSON.stringify({
          session_token: localStorage.getItem('session_token'),
        }),
      });

      if (response.ok) {
        localStorage.removeItem('session_token');
        window.location.href = '/login';
      }
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="relative">
      <Button
        variant="ghost"
        onClick={() => setShowProfileMenu(!showProfileMenu)}
        className="flex items-center space-x-2"
      >
        <div className="flex flex-col items-end">
          <span className="text-sm font-medium">{session.name}</span>
          <span className="text-xs text-gray-500">{session.email}</span>
        </div>
        <User className="h-4 w-4" />
      </Button>

      {showProfileMenu && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-md shadow-lg border z-50">
          <div className="py-1">
            <div className="px-4 py-2 border-b">
              <p className="text-sm font-medium">{session.name}</p>
              <p className="text-xs text-gray-500">{session.email}</p>
              <p className="text-xs text-gray-400 mt-1">
                Role: {session.currentOrganization.role}
              </p>
            </div>
            
            <button
              onClick={() => {/* Navigate to profile page */}}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              View Profile
            </button>
            
            <button
              onClick={() => {/* Navigate to settings */}}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              Settings
            </button>
            
            <button
              onClick={handleLogout}
              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
            >
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
