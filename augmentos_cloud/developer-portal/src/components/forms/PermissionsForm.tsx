import React from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Shield, Plus, Trash2 } from "lucide-react";

// Define our permission types
enum PermissionType {
  MICROPHONE = 'MICROPHONE',
  LOCATION = 'LOCATION',
  CALENDAR = 'CALENDAR',
  NOTIFICATIONS = 'NOTIFICATIONS',
  ALL = 'ALL'
}

// Permission interface matching our backend
export interface Permission {
  type: PermissionType;
  description?: string;
}

interface PermissionsFormProps {
  permissions: Permission[];
  onChange: (permissions: Permission[]) => void;
}

/**
 * Compact permission item component with mobile-friendly expandable editing
 */
interface PermissionItemProps {
  permission: Permission;
  index: number;
  isEditing: boolean;
  onEditToggle: (index: number | null) => void;
  removePermission: (index: number) => void;
  updatePermission: (index: number, field: keyof Permission, value: any) => void;
  availableTypes: PermissionType[];
}

const PermissionItem: React.FC<PermissionItemProps> = ({
  permission,
  index,
  isEditing,
  onEditToggle,
  removePermission,
  updatePermission,
  availableTypes,
}) => {
  // Get a human-readable description for permissions
  const getPermissionDescription = (type: PermissionType): string => {
    switch (type) {
      case PermissionType.MICROPHONE:
        return 'Access to microphone for voice input and audio processing';
      case PermissionType.LOCATION:
        return 'Access to device location information';
      case PermissionType.CALENDAR:
        return 'Access to calendar events';
      case PermissionType.NOTIFICATIONS:
        return 'Access to phone notifications';
      case PermissionType.ALL:
        return 'Access to all available permissions';
      default:
        return 'Permission access';
    }
  };

  // Helper function to get description preview
  const getDescriptionPreview = () => {
    if (permission.description && permission.description.trim()) {
      return permission.description.length > 50
        ? permission.description.substring(0, 50) + '...'
        : permission.description;
    }
    return getPermissionDescription(permission.type);
  };

  return (
    <div className="border rounded-lg bg-white shadow-sm">
      {!isEditing ? (
        // Collapsed view - just show the essential info
        <div
          className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => onEditToggle(index)}
        >
          <div className="flex items-center gap-3">
            {/* Content preview */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="h-4 w-4 text-blue-600 flex-shrink-0" />
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {permission.type}
                </span>
              </div>
              <div className="text-xs text-gray-500 truncate">
                {getDescriptionPreview()}
              </div>
            </div>

            {/* Delete button */}
            <Button
              onClick={(e) => {
                e.stopPropagation();
                removePermission(index);
              }}
              variant="ghost"
              size="sm"
              type="button"
              className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        // Expanded editing view
        <div className="p-4">
          {/* Header with close button */}
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Edit Permission
            </h4>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => onEditToggle(null)}
                variant="outline"
                size="sm"
                type="button"
                className="h-8 px-3 text-xs"
              >
                Done
              </Button>
              <Button
                onClick={() => removePermission(index)}
                variant="ghost"
                size="sm"
                type="button"
                className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Form fields */}
          <div className="space-y-4">
            {/* Permission Type */}
            <div>
              <Label className="text-sm font-medium">Permission Type</Label>
              <Select
                value={permission.type}
                onValueChange={(value) => updatePermission(index, 'type', value)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select permission type" />
                </SelectTrigger>
                <SelectContent>
                  {availableTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                  {/* Always show the current type even if it would be "unavailable" */}
                  {!availableTypes.includes(permission.type) && (
                    <SelectItem value={permission.type}>
                      {permission.type} (current)
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                {getPermissionDescription(permission.type as PermissionType)}
              </p>
            </div>

            {/* Description */}
            <div>
              <Label className="text-sm font-medium">Description (Optional)</Label>
              <Textarea
                value={permission.description || ''}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updatePermission(index, 'description', e.target.value)}
                placeholder="Explain why your app needs this permission..."
                rows={3}
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">
                A clear explanation helps users understand why this permission is necessary.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Compact permissions form component with mobile-friendly design
 */
export function PermissionsForm({ permissions, onChange }: PermissionsFormProps) {
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);

  // Helper function to create a new empty permission
  const createEmptyPermission = (type: PermissionType): Permission => ({
    type,
    description: ''
  });

  // Get available permission types (not already used)
  const getAvailablePermissionTypes = (excludeIndex?: number): PermissionType[] => {
    return Object.values(PermissionType).filter(
      type => !permissions.some((p, i) => p.type === type && i !== excludeIndex)
    );
  };

  // Add a new permission
  const addPermission = () => {
    const availableTypes = getAvailablePermissionTypes();

    // If all permission types are used, don't add a new one
    if (availableTypes.length === 0) {
      return;
    }

    const newPermission = createEmptyPermission(availableTypes[0]);
    const newPermissions = [...permissions, newPermission];
    onChange(newPermissions);
    // Auto-expand the newly added permission for editing
    setEditingIndex(newPermissions.length - 1);
  };

  // Remove a permission
  const removePermission = (index: number) => {
    const newPermissions = permissions.filter((_, i) => i !== index);
    onChange(newPermissions);
    // If we're removing the currently editing item, clear the editing state
    if (editingIndex === index) {
      setEditingIndex(null);
    } else if (editingIndex !== null && editingIndex > index) {
      // If we're removing an item before the currently editing one, adjust the index
      setEditingIndex(editingIndex - 1);
    }
  };

  // Update a permission
  const updatePermission = (index: number, field: keyof Permission, value: any) => {
    const updatedPermissions = [...permissions];
    updatedPermissions[index] = {
      ...updatedPermissions[index],
      [field]: value
    };
    onChange(updatedPermissions);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-lg font-medium flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Required Permissions
          </h3>
          <p className="text-sm text-gray-600">
            Specify what permissions your app requires to function properly.
          </p>
        </div>
        <Button
          onClick={addPermission}
          size="sm"
          type="button"
          className="h-8 px-3"
          disabled={getAvailablePermissionTypes().length === 0}
        >
          <Plus className="h-4 w-4 mr-1" />
          {getAvailablePermissionTypes().length === 0 ? "All Added" : "Add Permission"}
        </Button>
      </div>

      {permissions.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Shield className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>No permissions added yet.</p>
          <p className="text-sm">Add your first permission to specify app requirements.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {permissions.map((permission, index) => (
            <PermissionItem
              key={index}
              permission={permission}
              index={index}
              isEditing={editingIndex === index}
              onEditToggle={setEditingIndex}
              removePermission={removePermission}
              updatePermission={updatePermission}
              availableTypes={getAvailablePermissionTypes(index)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default PermissionsForm;