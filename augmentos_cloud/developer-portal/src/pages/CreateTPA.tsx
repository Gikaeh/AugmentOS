// pages/CreateTPA.tsx
import React, { useState } from 'react';
import { AxiosError } from 'axios';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, AlertCircle, CheckCircle, Upload } from "lucide-react";
// import { Switch } from "@/components/ui/switch";
import DashboardLayout from "../components/DashboardLayout";
import ApiKeyDialog from "../components/dialogs/ApiKeyDialog";
import TpaSuccessDialog from "../components/dialogs/TpaSuccessDialog";
import api, { AppResponse } from '@/services/api.service';
import { AppI } from '@augmentos/sdk';
import { normalizeUrl } from '@/libs/utils';
import { toast } from 'sonner';
import PermissionsForm from '../components/forms/PermissionsForm';
import { Permission } from '@/types/tpa';
import { useAuth } from '../hooks/useAuth';
import { useOrganization } from '@/context/OrganizationContext';
// import { TPA } from '@/types/tpa';
// Import the public email provider list
// import publicEmailDomains from 'email-providers/all.json';

/**
 * Page for creating a new TPA (Third Party Application)
 */
const CreateTPA: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentOrg } = useOrganization();

  // Form state
  const [formData, setFormData] = useState<Partial<AppI>>({
    packageName: '',
    name: '',
    description: '',
    publicUrl: '',
    logoURL: '',
    webviewURL: '',
    permissions: [], // Initialize permissions as empty array
    // isPublic: false,
    // tpaType: TpaType.STANDARD
  });

  // Validation state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Dialog states
  const [createdTPA, setCreatedTPA] = useState<AppResponse | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false);
  const [isSuccessDialogOpen, setIsSuccessDialogOpen] = useState(false);

  // Helper to get org domain from user email
  // const orgDomain = user?.email?.split('@')[1] || '';
  // Check if orgDomain is a public email provider
  // const isPublicEmailDomain = publicEmailDomains.includes(orgDomain);

  // Handle form changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target as any;
    setFormData((prev: Partial<AppI>) => ({
      ...prev,
      [name]: value
    }));

    // Clear error for field when changed
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  // Handle URL field blur event to normalize URLs
  const handleUrlBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target as any;

    // Only normalize URL fields
    if (name === 'publicUrl' || name === 'logoURL' || name === 'webviewURL') {
      if (value) {
        try {
          // Normalize the URL and update the form field
          const normalizedUrl = normalizeUrl(value);
          setFormData(prev => ({
            ...prev,
            [name]: normalizedUrl
          }));

          // Clear any URL validation errors
          if (errors[name]) {
            setErrors(prev => {
              const newErrors = { ...prev };
              delete newErrors[name];
              return newErrors;
            });
          }
        } catch (error) {
          console.error(`Error normalizing ${name}:`, error);
        }
      }
    }
  };

  // Handle permissions changes
  const handlePermissionsChange = (permissions: Permission[]) => {
    setFormData(prev => ({
      ...prev,
      permissions
    }));
  };



  // Validate form
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Package name validation
    if (!formData.packageName) {
      newErrors.packageName = 'Package name is required';
    } else if (!/^[a-z0-9.-]+$/.test(formData.packageName)) {
      newErrors.packageName = 'Package name must use lowercase letters, numbers, dots, and hyphens only';
    }

    // Display name validation
    if (!formData.name) {
      newErrors.name = 'Display name is required';
    }

    // Description validation
    if (!formData.description) {
      newErrors.description = 'Description is required';
    }

    // Public URL validation
    if (!formData.publicUrl) {
      newErrors.publicUrl = 'Server URL is required';
    } else {
      try {
        // Apply normalizeUrl to handle missing protocols before validation
        const normalizedUrl = normalizeUrl(formData.publicUrl);
        new URL(normalizedUrl);

        // Update the form data with the normalized URL
        setFormData(prev => ({
          ...prev,
          publicUrl: normalizedUrl
        }));
      } catch (e) {
        console.error(e);
        newErrors.publicUrl = 'Please enter a valid URL';
      }
    }

    // Logo URL validation
    if (!formData.logoURL) {
      newErrors.logoURL = 'Logo URL is required';
    } else {
      try {
        // Apply normalizeUrl to handle missing protocols before validation
        const normalizedUrl = normalizeUrl(formData.logoURL);
        new URL(normalizedUrl);

        // Update the form data with the normalized URL
        setFormData(prev => ({
          ...prev,
          logoURL: normalizedUrl
        }));
      } catch (e) {
        console.error(e);
        newErrors.logoURL = 'Please enter a valid URL';
      }
    }

    // Webview URL validation (optional)
    if (formData.webviewURL) {
      try {
        // Apply normalizeUrl to handle missing protocols before validation
        const normalizedUrl = normalizeUrl(formData.webviewURL);
        new URL(normalizedUrl);

        // Update the form data with the normalized URL
        setFormData(prev => ({
          ...prev,
          webviewURL: normalizedUrl
        }));
      } catch (e) {
        console.error(e);
        newErrors.webviewURL = 'Please enter a valid URL';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Clear previous error/success messages
    setFormError(null);
    setSuccessMessage(null);

    // Validate form data
    if (!validateForm()) {
      // Scroll to top to show errors
      window.scrollTo(0, 0);
      return;
    }

    // Check if organization is selected
    if (!currentOrg) {
      setFormError('Please select an organization to create this app');
      window.scrollTo(0, 0);
      return;
    }

    // Start loading state
    setIsLoading(true);

    try {
      // Prepare TPA data
      const tpaData: Partial<AppI> = {
        packageName: formData.packageName,
        name: formData.name,
        description: formData.description,
        publicUrl: formData.publicUrl,
        logoURL: formData.logoURL,
        webviewURL: formData.webviewURL,
        // tpaType: TpaType.STANDARD, // Using the default type
        permissions: formData.permissions
      };

      // Create TPA via API
      const result = await api.apps.create(currentOrg.id, tpaData as AppI);

      // Store API key and created TPA details
      setApiKey(result.apiKey);
      setCreatedTPA(result.app);

      // Show success message
      setSuccessMessage(`App "${formData.name}" created successfully!`);

      // Show API key dialog
      setIsApiKeyDialogOpen(true);
    } catch (error) {
      console.error('Error creating TPA:', error);

      // Handle specific error types
      if (error instanceof AxiosError && error.response) {
        // API error with response data
        if (error.response.status === 409) {
          // Package name conflict
          setErrors({
            ...errors,
            packageName: 'This package name is already in use. Please choose another.'
          });
          setFormError('Package name is already in use');
        } else if (error.response.data?.error) {
          // Other API error with message
          setFormError(error.response.data.error);
        } else {
          // General API error
          setFormError('Failed to create app. Please try again.');
        }
      } else {
        // Network or other error
        setFormError('Network error. Please check your connection and try again.');
      }

      // Scroll to top to show error
      window.scrollTo(0, 0);
    } finally {
      // End loading state
      setIsLoading(false);
    }
  };

  // Handle API key dialog close - simplified to be more direct
  const handleApiKeyDialogClose = (open: boolean) => {
    console.log("API Key dialog state changing to:", open);
    setIsApiKeyDialogOpen(open);

    // If dialog is closing, navigate to TPA list
    if (!open) {
      navigate('/tpas');
    }
  };

  // Handle success dialog close
  const handleSuccessDialogClose = (open: boolean) => {
    setIsSuccessDialogOpen(open);
  };

  // Handle view API key button click
  const handleViewApiKey = () => {
    console.log("View API Key button clicked");
    setIsSuccessDialogOpen(false);
    // Open API key dialog immediately
    setIsApiKeyDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center mb-6">
          <Link to="/tpas" className="flex items-center text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeftIcon className="mr-1 h-4 w-4" />
            Back to Apps
          </Link>
        </div>

        <Card className="shadow-sm card border-2 transition-colors duration-300">
          <form onSubmit={handleSubmit}>
            <CardHeader>
              <CardTitle className="text-2xl">Create New TPA</CardTitle>
              <CardDescription>
                Fill out the form below to register your app for AugmentOS.
              </CardDescription>
              {currentOrg && (
                <div className="mt-2 text-sm mb-3">
                  <span className="text-gray-500">Creating in organization: </span>
                  <span className="font-medium">{currentOrg.name}</span>
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-6 pb-5">
              {formError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="packageName">
                  Package Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="packageName"
                  name="packageName"
                  value={formData.packageName}
                  onChange={handleChange}
                  placeholder="e.g., org.example.myapp"
                  className={errors.packageName ? "border-red-500" : ""}
                />
                {errors.packageName && (
                  <p className="text-xs text-red-500 mt-1">{errors.packageName}</p>
                )}
                <p className="text-xs text-gray-500">
                  Must use lowercase letters, numbers, dots, and hyphens only. This is a unique identifier and cannot be changed later.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">
                  Display Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g., My Awesome App"
                  className={errors.name ? "border-red-500" : ""}
                />
                {errors.name && (
                  <p className="text-xs text-red-500 mt-1">{errors.name}</p>
                )}
                <p className="text-xs text-gray-500">
                  The name that will be displayed to users in the AugmentOS app store.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">
                  Description <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Describe what your app does..."
                  rows={3}
                  className={errors.description ? "border-red-500" : ""}
                />
                {errors.description && (
                  <p className="text-xs text-red-500 mt-1">{errors.description}</p>
                )}
                <p className="text-xs text-gray-500">
                  Provide a clear, concise description of your application's functionality.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="publicUrl">
                  Server URL <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="publicUrl"
                  name="publicUrl"
                  value={formData.publicUrl}
                  onChange={handleChange}
                  onBlur={handleUrlBlur}
                  placeholder="yourserver.com"
                  className={errors.publicUrl ? "border-red-500" : ""}
                />
                {errors.publicUrl && (
                  <p className="text-xs text-red-500 mt-1">{errors.publicUrl}</p>
                )}
                <p className="text-xs text-gray-500">
                  The base URL of your server where AugmentOS will communicate with your app.
                  We'll automatically append "/webhook" to handle events when your app is activated.
                  HTTPS is required and will be added automatically if not specified.
                  Do not include a trailing slash - it will be automatically removed.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="logoURL">
                  Logo URL <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="logoURL"
                  name="logoURL"
                  value={formData.logoURL}
                  onChange={handleChange}
                  onBlur={handleUrlBlur}
                  placeholder="yourserver.com/logo.png"
                  className={errors.logoURL ? "border-red-500" : ""}
                />
                {errors.logoURL && (
                  <p className="text-xs text-red-500 mt-1">{errors.logoURL}</p>
                )}
                <p className="text-xs text-gray-500">
                  URL to an image that will be used as your app's icon (recommended: 512x512 PNG).
                  HTTPS is required and will be added automatically if not specified.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="webviewURL">Webview URL (Optional)</Label>
                <Input
                  id="webviewURL"
                  name="webviewURL"
                  value={formData.webviewURL || ''}
                  onChange={handleChange}
                  onBlur={handleUrlBlur}
                  placeholder="yourserver.com/webview"
                  className={errors.webviewURL ? "border-red-500" : ""}
                />
                {errors.webviewURL && (
                  <p className="text-xs text-red-500 mt-1">{errors.webviewURL}</p>
                )}
                <p className="text-xs text-gray-500 pb-5">
                  If your app has a companion mobile interface, provide the URL here.
                  HTTPS is required and will be added automatically if not specified.
                </p>
              </div>





              {/* Permissions Section */}
              <div className="mt-6">
                <PermissionsForm
                  permissions={formData.permissions || []}
                  onChange={handlePermissionsChange}
                />
              </div>

            </CardContent>
            <CardFooter className="flex justify-between border-t p-6">
              <Button variant="outline" type="button" onClick={() => navigate('/tpas')}>
                Back
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Creating..." : "Create App"}
              </Button>
            </CardFooter>
          </form>

          {successMessage && (
              <div className="m-4 mb-0">
                <Alert className="bg-green-100 border-1 border-green-500 text-green-800 shadow-md">
                  <CheckCircle className="h-5 w-5 text-green-800" />
                  <div>
                    <AlertDescription className="text-green-800 font-medium">{successMessage}</AlertDescription>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsApiKeyDialogOpen(true)}
                        className="border-green-500 text-green-700 hover:bg-green-50"
                      >
                        View API Key
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate('/tpas')}
                        className="border-green-500 text-green-700 hover:bg-green-50"
                      >
                        Go to My Apps
                      </Button>
                    </div>
                  </div>
                </Alert>
              </div>
            )}
        </Card>


      </div>

      {/* API Key Dialog after successful creation */}
      {createdTPA && (
        <>
          <TpaSuccessDialog
            tpa={createdTPA}
            apiKey={apiKey}
            open={isSuccessDialogOpen}
            onOpenChange={handleSuccessDialogClose}
            onViewApiKey={handleViewApiKey}
          />

          <ApiKeyDialog
            tpa={createdTPA}
            apiKey={apiKey}
            open={isApiKeyDialogOpen}
            onOpenChange={handleApiKeyDialogClose}
            onKeyRegenerated={(newKey) => {
              setApiKey(newKey);
              console.log(`API key regenerated for ${createdTPA?.name}`);
            }}
            orgId={currentOrg?.id}
          />
        </>
      )}
    </DashboardLayout>
  );
};

export default CreateTPA;