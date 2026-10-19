import { Link } from 'react-router-dom';
import { ArrowRight, AtSign, Users, UserRound } from 'lucide-react';
import { EMAIL_CHOICES } from './playerRegistration';

const ICONS = { own: AtSign, guardian: Users, none: UserRound };

/**
 * The first screen of player registration: whose email, if any, the player
 * will use. Each answer is a link to its own form (`?with=…`), so Back from the
 * form comes back here.
 */
const RegistrationChoice = () => (
  <nav aria-label="How will you register?">
    <ul className="shell-auth__choices">
      {EMAIL_CHOICES.map((choice) => {
        const Icon = ICONS[choice.key];
        return (
          <li key={choice.key}>
            <Link to={`?with=${choice.key}`} className="shell-auth__choice" data-choice={choice.key}>
              <Icon className="shell-auth__choice-icon" aria-hidden="true" />
              <span className="shell-auth__choice-text">
                <span className="shell-auth__choice-title type-body">{choice.title}</span>
                <span className="shell-auth__choice-description type-body-s">{choice.description}</span>
              </span>
              <ArrowRight className="shell-auth__choice-arrow" aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  </nav>
);

export default RegistrationChoice;
