import type { Bundle } from '@shared/okf/types'

export function LogTimeline({ bundle }: { bundle: Bundle }): JSX.Element {
  if (bundle.logs.length === 0) {
    return (
      <div className="log-empty">
        <h2>No change log</h2>
        <p>
          This bundle has no <code>log.md</code> files. Producers add them to record a
          chronological history of updates.
        </p>
      </div>
    )
  }

  return (
    <div className="log-timeline">
      {bundle.logs.map((log) => (
        <section key={log.path} className="log-file">
          <h2 className="log-scope">
            {log.dir ? `${log.dir}/log.md` : 'log.md'}
          </h2>
          <div className="timeline">
            {log.days.map((day, di) => (
              <div key={di} className="timeline-day">
                <div className="timeline-marker">
                  <span className="timeline-dot" />
                  <span className="timeline-date">{day.date}</span>
                </div>
                <ul className="timeline-entries">
                  {day.entries.map((e, ei) => (
                    <li key={ei}>
                      {e.verb && <span className={`log-verb ${e.verb.toLowerCase()}`}>{e.verb}</span>}
                      {e.text}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
