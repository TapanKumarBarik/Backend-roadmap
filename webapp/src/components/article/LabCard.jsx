import { LabIcon, ArrowRightIcon } from '../common/icons.jsx';
import LabAnimation from './LabAnimation.jsx';
import '../../styles/lab-card.css';

export default function LabCard({ tools }) {
  if (!tools || !tools.length) return null;
  const primary = tools[0];
  const others = tools.slice(1);

  return (
    <div className="lab-card">
      <div className="lab-card__header">
        <div className="lab-card__badge">
          <LabIcon />
          <span>Try it in the Lab</span>
        </div>
        <span className="lab-card__type">{primary.badge}</span>
      </div>

      <div className="lab-card__body">
        <div className="lab-card__info">
          <h3 className="lab-card__title">
            <a href={primary.href}>{primary.title}</a>
          </h3>
          <p className="lab-card__desc">{primary.tagline}</p>

          <div className="lab-card__actions">
            <a href={primary.href} className="lab-card__btn">
              <span>Launch Simulator</span>
              <ArrowRightIcon />
            </a>
          </div>
        </div>

        <div className="lab-card__preview">
          <LabAnimation type={primary.animType} />
        </div>
      </div>

      {others.length > 0 && (
        <div className="lab-card__others">
          <span className="lab-card__others-label">Also in the lab:</span>
          <div className="lab-card__others-links">
            {others.map((t) => (
              <a key={t.id} href={t.href} className="lab-card__others-link">
                {t.shortTitle} →
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
