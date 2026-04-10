import React, { useState } from 'react';
import { Mail, Lock, Plus, Save } from 'lucide-react';
import { ThemeProvider } from '../theme/ThemeProvider';
import { ThemedInput } from './ThemedInput';
import { ThemedSelect } from './ThemedSelect';
import { ThemedTextarea } from './ThemedTextarea';
import { ThemedButton } from './ThemedButton';

/**
 * FormsDemo - Demo component showcasing all form components
 * This is for development/testing purposes only
 */
export const FormsDemo = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const roles = ['admin', 'coach', 'player', 'judge'];
  const [selectedRole, setSelectedRole] = useState('admin');

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => setLoading(false), 2000);
  };

  return (
    <div className="min-h-screen bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-3xl font-bold text-white mb-8">Form Components Demo</h1>

        {/* Role Selector */}
        <div className="bg-white/5 p-6 rounded-lg">
          <label className="block text-white mb-2">Select Role Theme:</label>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="px-4 py-2 rounded bg-white/10 text-white border border-white/20"
          >
            {roles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>

        {/* Form Demo */}
        <ThemeProvider role={selectedRole}>
          <form onSubmit={handleSubmit} className="bg-white/5 p-6 rounded-lg space-y-6">
            <h2 className="text-xl font-semibold text-white mb-4">
              {selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)} Theme
            </h2>

            {/* ThemedInput Examples */}
            <div className="space-y-4">
              <h3 className="text-lg text-white/80">ThemedInput</h3>

              <ThemedInput icon={Mail} type="email" placeholder="Email address" />

              <ThemedInput
                icon={Lock}
                type={showPassword ? 'text' : 'password'}
                placeholder="Password"
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-white/60 hover:text-white"
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                }
              />

              <ThemedInput placeholder="Input with error" error="This field is required" />

              <ThemedInput placeholder="Disabled input" disabled />
            </div>

            {/* ThemedSelect Example */}
            <div className="space-y-4">
              <h3 className="text-lg text-white/80">ThemedSelect</h3>

              <ThemedSelect
                placeholder="Select an option"
                options={[
                  { value: 'option1', label: 'Option 1' },
                  { value: 'option2', label: 'Option 2' },
                  { value: 'option3', label: 'Option 3' },
                ]}
              />
            </div>

            {/* ThemedTextarea Example */}
            <div className="space-y-4">
              <h3 className="text-lg text-white/80">ThemedTextarea</h3>

              <ThemedTextarea placeholder="Enter description..." rows={4} />
            </div>

            {/* ThemedButton Examples */}
            <div className="space-y-4">
              <h3 className="text-lg text-white/80">ThemedButton</h3>

              <div className="flex flex-wrap gap-4">
                <ThemedButton variant="solid" size="sm">
                  Small Solid
                </ThemedButton>

                <ThemedButton variant="solid" size="md">
                  Medium Solid
                </ThemedButton>

                <ThemedButton variant="solid" size="lg">
                  Large Solid
                </ThemedButton>
              </div>

              <div className="flex flex-wrap gap-4">
                <ThemedButton variant="outline">Outline</ThemedButton>

                <ThemedButton variant="ghost">Ghost</ThemedButton>

                <ThemedButton icon={Plus}>With Icon</ThemedButton>

                <ThemedButton loading={loading}>
                  {loading ? 'Loading...' : 'Click to Load'}
                </ThemedButton>
              </div>

              <div className="flex gap-4">
                <ThemedButton type="submit" icon={Save} loading={loading}>
                  Submit Form
                </ThemedButton>

                <ThemedButton variant="outline" disabled>
                  Disabled
                </ThemedButton>
              </div>
            </div>
          </form>
        </ThemeProvider>
      </div>
    </div>
  );
};

export default FormsDemo;
