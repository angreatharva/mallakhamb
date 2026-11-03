import { useRef } from 'react';
import PropTypes from 'prop-types';
import toast from 'react-hot-toast';
import { Camera, Scale } from 'lucide-react';
import { judgeAPI } from '@/services/public/judge.api';
import { logger } from '@/infrastructure/logger';
import { Heading, Panel, Tag } from '@/components/ui';

/**
 * Downscale a chosen image before it is sent.
 *
 * Photos are stored inline on the account (there is no object storage in this
 * project and the deployment disk is ephemeral), so the client is responsible
 * for keeping them small — a phone photo would otherwise blow past the API's
 * body limit.
 *
 * @param {File} file
 * @param {number} size - Longest edge, in pixels
 * @returns {Promise<string>} JPEG data URL
 */
export const downscaleImage = (file, size = 256) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that image'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('That file is not an image'));
      image.onload = () => {
        const scale = Math.min(size / image.width, size / image.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

/**
 * The judge's identity at the top of their home and profile: photo (with the
 * change button), the Judge tag, the name, and the facts organisers see when
 * staffing a panel.
 */
const JudgeIdentity = ({ profile, photo = null, onPhotoChange = null, headingLevel = 1 }) => {
  const photoInputRef = useRef(null);

  const onChangePhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const dataUrl = await downscaleImage(file);
      await judgeAPI.updateProfile({ photo: dataUrl });
      onPhotoChange?.(dataUrl);
      toast.success('Photo updated');
    } catch (error) {
      logger.error('Could not update judge photo', error);
      toast.error(error.response?.data?.message || error.message || 'Could not update your photo');
    }
  };

  const facts = [
    { label: 'Email', value: profile?.email || 'None' },
    { label: 'Certification', value: profile?.certificationLevel || 'Not set' },
    { label: 'State / Unit', value: profile?.stateUnit || 'Not set' },
  ];

  return (
    <Panel variant="feature">
      <div className="flex items-center gap-5 flex-wrap">
        <div className="relative shrink-0">
          <div className="w-20 h-20 overflow-hidden flex items-center justify-center bg-surface-raised rounded-[var(--radius-panel)]">
            {photo
              ? <img src={photo} alt="" className="w-full h-full object-cover" />
              : <Scale className="w-9 h-9 text-accent-fg" aria-hidden="true" />}
          </div>
          {onPhotoChange && (
            <>
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="ui-btn ui-btn--solid ui-icon-btn absolute -bottom-2 -right-2"
                aria-label="Change photo"
              >
                <span className="ui-btn__label" style={{ display: 'contents' }}>
                  <Camera aria-hidden="true" />
                </span>
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={onChangePhoto}
              />
            </>
          )}
        </div>

        <div className="min-w-0 flex-1 grid gap-2">
          <Tag tone="ident" className="justify-self-start">Judge</Tag>
          <Heading level={headingLevel} step="display-m" asIs className="m-0 break-words">{profile?.name}</Heading>
          <dl className="grid gap-x-6 gap-y-1 m-0 sm:grid-cols-[auto_1fr]">
            {facts.map(({ label, value }) => (
              <div key={label} className="contents">
                <dt className="type-tag text-fg-secondary">{label}</dt>
                <dd className="m-0 type-body break-all">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </Panel>
  );
};

JudgeIdentity.propTypes = {
  profile: PropTypes.object,
  photo: PropTypes.string,
  /** Given → the photo can be changed here; called with the new data URL once saved. */
  onPhotoChange: PropTypes.func,
  headingLevel: PropTypes.number,
};

export default JudgeIdentity;
