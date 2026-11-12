package server

import (
	"net/http"

	"gitview/internal/workspace"
)

// Background jobs: an operation registered with newJob answers
// POST .../operations/{op} with 202 Accepted and the queued job. Its
// progress and state changes arrive as job.updated events on
// GET /api/v1/events; its commands and error are read here once it has
// finished.
//
//	GET  /api/v1/repos/{repoId}/jobs                  running and recent jobs, oldest first
//	GET  /api/v1/repos/{repoId}/jobs/{jobId}          one job
//	POST /api/v1/repos/{repoId}/jobs/{jobId}/cancel   stop a job
//	POST /api/v1/repos/{repoId}/jobs/{jobId}/prompt   answer or decline the job's credential prompt
//
// A job waiting for credentials has a "prompt" ({id, text, secret}), also
// carried by its job.updated events; answer it with
// {"promptId": id, "answer": "..."}, or "answer": null to decline.
func (s *Server) registerJobs(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/repos/{repoId}/jobs", s.withRepo(s.listJobs))
	mux.HandleFunc("GET /api/v1/repos/{repoId}/jobs/{jobId}", s.withRepo(s.getJob))
	mux.HandleFunc("POST /api/v1/repos/{repoId}/jobs/{jobId}/cancel", s.withRepo(s.cancelJob))
	// Credential prompts: the helper asks (askpass.go), the browser answers.
	mux.HandleFunc("POST /api/v1/repos/{repoId}/jobs/{jobId}/prompt", s.withRepo(s.answerPrompt))
	mux.HandleFunc("POST "+AskpassPath, s.answerAskpass)
}

// jobView is a job as the API returns it.
type jobView struct {
	workspace.Job
	// Error is why the job failed; absent unless its state is "failed".
	Error *apiError `json:"error,omitempty"`
}

func viewJob(job workspace.Job) jobView {
	view := jobView{Job: job}
	if job.Err != nil {
		_, described := describeError(job.Err)
		view.Error = &described
	}
	return view
}

func (s *Server) startJob(w http.ResponseWriter, repo *workspace.Repo, operation string, run workspace.WriteFunc) {
	job := repo.StartJob(operation, run)
	writeJSON(w, http.StatusAccepted, map[string]any{"data": viewJob(job)})
}

func (s *Server) listJobs(w http.ResponseWriter, _ *http.Request, repo *workspace.Repo) {
	views := []jobView{}
	for _, job := range repo.Jobs() {
		views = append(views, viewJob(job))
	}
	writeData(w, views)
}

func (s *Server) getJob(w http.ResponseWriter, r *http.Request, repo *workspace.Repo) {
	job, ok := repo.Job(r.PathValue("jobId"))
	if !ok {
		writeJobNotFound(w, r)
		return
	}
	writeData(w, viewJob(job))
}

func (s *Server) cancelJob(w http.ResponseWriter, r *http.Request, repo *workspace.Repo) {
	job, ok := repo.CancelJob(r.PathValue("jobId"))
	if !ok {
		writeJobNotFound(w, r)
		return
	}
	writeData(w, viewJob(job))
}

func writeJobNotFound(w http.ResponseWriter, r *http.Request) {
	writeError(w, http.StatusNotFound, "job_not_found",
		"no job "+r.PathValue("jobId")+" in this repository; finished jobs are forgotten after a while, so refresh to see current ones")
}
